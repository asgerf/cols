var cols = require('../cols')

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


