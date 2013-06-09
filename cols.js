var Promise = require('promise')
var fs = require('fs')

function Cols(fn) {
    this.promise = fn instanceof Promise ? fn : new Promise(fn);
}

var empty = new Cols(function (resolve,reject) {
    resolve([]);
});

Cols.prototype.then = function (onSuccess,onFail) {
    return new Cols(this.promise.then(onSuccess,onFail))
};

Cols.prototype.printErrors = function () {
    return new Cols(this.promise.then(null, function(e) {
        console.error(e.stack)
    }))
};

Cols.prototype.file = function(filename, options) {
    options = options || {}
    if (!options.encoding) options.encoding = 'utf8'
    var promise = new Promise(function (resolve,reject) {
        fs.readFile(filename, options, function (e,data) {
            if (e) {
                reject(e)
            } else {
                // TODO: make this faster
                resolve(data.toString().split(/\r?\n|\r/).filter(function (str) { return str !== ''})) 
            }
        })
    })
    return this.then(function(data1) {
        return promise.then(function(data2) {
            if (data1.length === 0) return data2 // minor optimization
            return data1.concat(data2)
        })
    })
};

Cols.prototype.files = function(filenames, options) {
    var x = this
    for (var i=0; i<filenames.length; i++) {
        x = x.file(filenames[i], options)
    }
    return x
}

Cols.prototype.columns = function() {
    var sep = /\s+/
    var names = []
    for (var i=0; i<arguments.length; i++) {
        var arg = arguments[i];
        if (typeof arg === 'string' || arg === null)
            names.push(arg)
        else if (arg instanceof RegExp)
            sep = arg
        else
            throw new Error("Invalid argument to columns: " + arg)
    }
    return this.then(function (data) {
        return data.map(function (line) {
            var items = line.split(sep)
            var obj = {}
            for (var i=0; i<names.length; i++) {
                var name = names[i]
                if (name !== null) {
                    obj[names[i]] = items[i]
                }
            }
            return obj
        })
    })
};

Cols.prototype.map = function(fn) {
    fn = liftTT(fn)
    return this.then(function (data) {
        var result = []
        for (var i=0; i<data.length; i++) {
            var x = fn.call(data[i])
            if (x !== null) {
                result.push(x)
            }
        }
        return result
    })
};

function compareBy(fn, fallback) {
    var sgn = 1;
    if (typeof fn === 'string' && fn[0] === '-') {
        sgn = -1;
        fn = fn.substring(1)
    }
    fn = liftTV(fn)
    return function(x,y) {
        x = fn.call(x)
        y = fn.call(y)
        if (x === y) return fallback(x,y)
        else return x < y ? -sgn : sgn
    }
}

Cols.prototype.sort = function(fn) {
    if (arguments.length === 0) throw new Error("Sort by what? Pass one or more arguments.")
    var compare = constant(0)
    for (var i=arguments.length-1; i--; i>=0) {
        compare = compareBy(arguments[i],compare)
    }
    return this.then(function (data) {
        var result = data.splice(0)
        result.sort(compare)
        return result
    })
}

Cols.prototype.group = function(fn, mapArg) {
    mapArg = mapArg || {}
    if (typeof fn === 'string' && !(fn in mapArg)) {
        mapArg[fn] = first
    }
    fn = liftTV(fn)
    var grouped = this.then(function (data) {
        var result = []
        var key2group = {}
        for (var i=0; i<data.length; i++) {
            var x = data[i];
            var key = fn.call(x)
            if (key === null)
                continue
            key = '$' + key // prevent access to built-in properties like __proto__
            var obj = key2group[key]
            if (!obj) {
                key2group[key] = obj = {}
                result.push(obj)
            }
            for (var k in x) {
                if (!x.hasOwnProperty(k))
                    continue
                if (obj.hasOwnProperty(k)) {
                    obj[k].push(x[k])
                } else {
                    obj[k] = [x[k]]
                }
            }
        }
        return result
    });
    return grouped.map(mapArg)
}

Cols.prototype.collapse = function(mapArg) {
    return this.group(constant(0), mapArg)
}

function liftPredicate(fn) {
    switch (typeof fn) {
        case 'function': return fn
        case 'object': return function() {
            for (var k in fn) {
                if (!fn.hasOwnProperty(k))
                    continue
                if (!fn[k].call(this, this[k]))
                    return false
            }
            return true
        }
        case 'string': return pluck(fn)
        default: throw new Error("Cannot be used as predicate: " + fn)
    }
}

Cols.prototype.filter = function(fn) {
    fn = liftPredicate(fn)
    return this.map(function() {
        return fn.call(this) ? this : null
    })
}

Cols.prototype.join = function(table) {
    return this.then(function (data1) {
        return table.then(function (data2) {
            // TODO: use some kind of indexing for common properties
            var result = [];
            for (var i=0; i<data1.length; i++) {
                var x = data1[i]
                objLoop:
                for (var j=0; j<data2.length; j++) {
                    var y = data2[j]
                    var obj = {}
                    for (var k in x) {
                        if (!x.hasOwnProperty(k))
                            continue
                        if (y.hasOwnProperty(k) && y[k] !== x[k])
                            continue objLoop // discard object
                        obj[k] = x[k]
                    }
                    for (var k in y) {
                        if (!y.hasOwnProperty(k))
                            continue
                        if (x.hasOwnProperty(k))
                            continue // handled above
                        obj[k] = y[k]
                    }
                    result.push(obj)
                }
            }
            return result
        })
    })
}

function parseColumnSpec(str) {
    return liftTV(str)
    // var toks = str.split(/\s+/)
    // if (toks.length === 1) {
    //     return {fn: pluck(toks[0]), format:"%s "}
    // } else  {
    //     return {fn: pluck(toks[0]), format:toks[1]}
    // }
}

Cols.prototype.print = function() {
    if (arguments.length === 0) {
        return this.then(function(data) {
            console.dir(data)
            return data
        })
    } else {
        var columns = []
        for (var i=0; i<arguments.length; i++) {
            columns.push(parseColumnSpec(arguments[i]))
        }
        return this.then(function(data) {
            for (var i=0; i<data.length; i++) {
                var x = data[i]
                var str = ''
                for (var j=0; j<columns.length; j++) {
                    if (j > 0) {
                        str += ' '
                    }
                    str += columns[j].call(x)
                }
                console.log(str)
            }
            return data
        })
    }
};


// Function Coercion
// ================

// create function that applies pointwise to fields
function pointwise_id(fn_obj) {
    return function () {
        var obj = this
        var result = {}
        for (var k in obj) {
            if (!obj.hasOwnProperty(k))
                continue
            var fn = fn_obj[k]
            if (typeof fn === 'undefined') fn = fn_obj['*']
            switch (typeof fn) {
                case 'function':
                    result[k] = fn.call(obj, obj[k]);
                    break;
                case 'undefined':
                    result[k] = obj[k]; // carry over old value
                    break;
                default:
                    if (fn === null)
                        break; // discard value
                    throw new Error("Not usable as function in pointwise operator: " + fn)
            }
        }
        // handle newly introduced fields
        for (var k in fn_obj) {
            if (!fn_obj.hasOwnProperty(k))
                continue
            if (obj.hasOwnProperty(k))
                continue // only take fields not handled in previous loop
            var fn = fn_obj[k]
            switch (typeof fn) {
                case 'function':
                    result[k] = fn.call(obj)
                    break;
                default:
                    if (fn === null)
                        break; // discard value
                    throw new Error("Not usable as function in pointwise operator: " + fn)
            }
        }
        return result
    }
}
// pluck('foo') creates function that reads foo on this
function pluck(str) {
    return function() {
        return this[str]
    }
}
// convert a shorthand value to a value->value function
function liftVV(fn) {
    switch (typeof fn) {
        case 'function': return fn
        default: throw new Error("Not usable a value->value function: " + fn)
    }
}
// convert a shorthand value to a tuple->value function
function liftTV(fn) {
    switch (typeof fn) {
        case 'function': return fn
        case 'string': return pluck(fn)
        default: throw new Error("Not usable a value->value function: " + fn)
    }
}
// convert a shorthand value to a tuple->tuple function
function liftTT(fn) {
    switch (typeof fn) {
        case 'function': return fn
        case 'object': return pointwise_id(fn)
        // case 'string': return pluck(fn)
        default: throw new Error("Not usable as tuple->tuple function: " + fn)
    }
}

function id(xs) {
    return xs;
}
function sum(xs) {
    return xs.reduce(function (x,y) { return x + y })
}
function product(xs) {
    return xs.reduce(function (x,y) { return x * y })
}
function minimum(xs) {
    return xs.reduce(function (x,y) { return Math.min(x,y) })
}
function maximum(xs) {
    return xs.reduce(function (x,y) { return Math.max(x,y) })
}
function average(xs) {
    return sum(xs) / xs.length
}
function first(xs) {
    return xs[0]
}
function last(xs) {
    return xs[xs.length-1]
}
function count(xs) {
    return xs.length
}
function constant(x) {
    return function() { return x; }
}

function equals(x) {
    return function(y) { return x === y }
}

module.exports = {
    file: function(filename,options) {
        return empty.file(filename,options)
    },
    files: function(filenames,options) {
        return empty.files(filenames,options)
    },
    data : function(data) {
        return new Cols(function (resolve) {
            resolve(data)
        })
    },
    id: id,
    sum: sum,
    product: product,
    minimum: minimum,
    maximum: maximum,
    average: average,
    first: first,
    last: last,
    count: count,
    constant: constant,
    lift: liftTV
}
