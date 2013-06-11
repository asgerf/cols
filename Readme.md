cols
====

Quick and simple data processing using relational algebra. `cols` is designed to replace tools like awk and perl for processing text-based data files.


Example Usage
=============

Suppose we have these data in a file called `octane.txt`:

	chrome richards 		539		15724
	chrome deltablue 		883		21898
	chrome crypto 			1698	20150
	chrome raytrace 		904		24814
	chrome earley-boyer 	4684	35414
	chrome regexp 			1764	4174
	chrome splay 			394		4989
	chrome navier-stokes 	409		21854
	chrome pdf.js 			33055	16765
	chrome mandreel 		277377	16667
	chrome gb-emulator 		11108	16575
	chrome codeload 		1531	15000
	chrome box2d-web 		562		16489
	safari richards 		539		10915
	safari deltablue 		883		7372
	safari crypto 			1698	16712
	safari raytrace 		904		10971
	safari earley-boyer 	4684	10994
	safari regexp 			1764	3669
	safari splay 			394		10545
	safari navier-stokes 	409		13168
	safari pdf.js 			33055	4217
	safari mandreel 		277377	7420
	safari gb-emulator 		11108	7895
	safari codeload 		1531	27342
	safari box2d-web 		562		16380

We can quickly compute the average score per browser like this:

```javascript
cols = require('cols')

cols.file('octane.txt')
	.columns('browser', 'bench', 'lines', 'score')
	.map({
		lines: Number,
		score: Number
	})
	.group('browser', {
		score: cols.average
	})
	.map({
		score: function(x) { return x.toFixed(0) }
	})
	.print('browser', 'score')
	.printErrors()
```

This will print:

	chrome 17732
	safari 11354


We can add in a few more statistics like this

```javascript
function round(x) {
	return x.toFixed(0)
}

cols.file('octane.txt')
	.columns('browser', 'bench', 'lines', 'score')
	.map({
		lines: Number,
		score: Number
	})
	.group('browser', {
		min: function() { return cols.minimum(this.score) },
		max: function() { return cols.maximum(this.score) },
		average: function() { return cols.average(this.score) }
	})
	.map({
		min: round,
		max: round,
		average: round
	})
	.print('browser', 'min', 'max', 'average')
	.printErrors()
```

This will print:

	chrome 4174 35414 17732
	safari 3669 27342 11354


How It Works
============

#### `cols.file('octane.txt')` 

This returns a *promise*, yielding an array of strings with all the lines in octane.txt, like this:

```javascript
["chrome richards       539     15724"
 "chrome deltablue      883     21898",
 "chrome crypto         1698    20150",
 ...]
```

#### `.columns('browser', 'bench', 'lines', 'score')` 

This splits each line by whitespace. This yields an array of objects, whose properties correspond to the chosen column names:

```javascript
[{browser: "chrome", bench: "richards",  lines: "539",  score: "15724"},
 {browser: "chrome", bench: "deltablue", lines: "883",  score: "21898"},
 {browser: "chrome", bench: "crypto",    lines: "1698"  score: "20150"},
 ...]
```

#### `.map({ lines: Number, score: Number })` 

The `map` function applies a function to each item. When an object is passed as argument to `map`, it is treated as a *pointwise* map where a separate function can be specified for each column. We convert the two numeric columns to numbers and leave the other columns unmodified.

```javascript
[{browser: "chrome", bench: "richards",  lines: 539,  score: 15724},
 {browser: "chrome", bench: "deltablue", lines: 883,  score: 21898},
 {browser: "chrome", bench: "crypto",    lines: 1698  score: 20150},
 ...]
```

#### `.group('browser', { score: cols.average })`

The above call is equivalent to `.group('browser').map({ score: cols.average })`. The second argument is just a convenient way to call for `map` after the `group` operation.

Let's see how the output looks after `.group('browser')` (with only one argument):
```javascript
[{browser: "chrome", bench:["richards","deltablue","crypto", ...],
				     lines:[539,       883,        1698,     ...],
				     score:[15724,     21898,      20150,    ...]},
 {browser: "safari", bench:["richards","deltablue","crypto", ...],
				     lines:[539,       883,        1698,     ...],
				     score:[10915,     7372,       16712,    ...]}]
```

After applying `.map({ score: cols.average })`, the `score` column has been collapsed to just a number:

```javascript
[{browser: "chrome", bench:["richards","deltablue","crypto", ...],
				     lines:[539,       883,        1698,     ...],
				     score:17731.76923076923},
 {browser: "safari", bench:["richards","deltablue","crypto", ...],
				     lines:[539,       883,        1698,     ...],
				     score:11353.846153846154}]
```

#### `.map({ score: function(x) { return x.toFixed(0) }	})`

This simply converts the scores to strings without all the decimals:

```javascript
[{browser: "chrome", bench:["richards","deltablue","crypto", ...],
				     lines:[539,       883,        1698,     ...],
				     score:"17731"},
 {browser: "safari", bench:["richards","deltablue","crypto", ...],
				     lines:[539,       883,        1698,     ...],
				     score:"11353"}]
```

#### `.print('browser', 'score')`

Prints the given columns to the console separated by spaces:

	chrome 17732
	safari 11354


API
===

### `columns([regex], name1, name2, ...)`

Splits each input row by whitespace and assigns the *N*-th substring to the *N*-th column name.

Columns are split by the expression `/\s+/` by default. If any of the arguments is a regex, that regex is used for splitting instead.

### `map(fn)`

Applies `fn` to each row and yields a new array with the returned values. Note that the row is passed as the *this* argument to `fn`. If `fn` returns `null`, the row is discarded.

***Pointwise function conversion:*** 

If `fn` is an object, say `{foo: F}`, it will apply `F` to column `foo` and leave the other columns intact. Any number of columns can be specified. `F` will take the original row as *this* argument, and the first argument will be the value of its `foo` column, if it exists.

It is possible to create new columns using a pointwise map, simply by specifying functions for columns that did not exist (see the example with *min*, *max*, and *average* above).

A column can be deleted by passing `null` for that column instead of a function.

### `group(fn, [mapFn])`

Groups together rows for which `fn` evaluates to the same string value, then applies `map(mapFn)` in the result.

The output has a single row for each group and has the same column names as the input. The value in each column is an array holding all the values that were grouped together.

***Column-name function conversion:***

If `fn` is a string, then `fn` is converted to the function that reads off the column of that name. Additionally, unless `mapFn` specifies otherwise, the column named by `fn` will be collapsed to a single value holding the value of that column, rather than an array of equivalent values.

### `filter(fn)`

Discards rows for which `fn` evaluates to a false-like value. Note that the row is passed as the *this* argument to `fn`.

***Pointwise function conversion:*** 

If `fn` is an object, say `{foo:F}`, it will apply `F` to column `foo` and discard the row if the result was false-like. `F` will take the original row as *this* argument, and the first argument will be the value of its `foo` column. If multiple columns are specified, *all* the columns must have their condition satisfied or the entire row gets discarded. 

### `sort(key1, key2, ...)`

Sorts the array based on one or more criteria.

If a function is passed as key, it will be given a row as `this` argument and must return a string or number.

If a string is passed as key, the value of that column is used for sorting. The name of a column may be preceeded by a minus (`-`) to reverse the ordering.

### `then(onSuccess, [onFail])`

The `then` method from [Promises/A+](http://promises-aplus.github.io/promises-spec/). The value passed to the `onSuccess` function is the array of values produced by this promise. The array can generally be assumed to be homogenous (i.e. all element have same type and structure).

`then` is powerful enough to implement any of the other operations, but it generally takes a bit more code. Quite often, however, it's easier to solve a problem "by hand" using `then` than to figure out how to solve it using clever algebraic operators, and there is no shame in doing so.

### `print(col1, col2, ...)`

Prints the value of the given columns to the console, separated by spaces.

If no column names are given, instead the entire array is printed using `console.dir`, which is mostly for debugging purposes.

### `printErrors()`

Responds to an error by printing it to `console.error`.

It is a good idea to end *all* operation chains using a `printError()` call since exceptions will otherwise go unnoticed.

### TODO

document rest of API
