var cols = require('../cols')

cols.file('octane.txt')
	.columns('browser', 'bench', 'lines', 'score')
	.map({
		lines: Number,
		score: Number
	})
	.group('browser', {
		score: cols.average
	})
	// .map({
	// 	score: function(x) { return x.toFixed(0) }
	// })
	.print('browser', 'score')
	.printErrors()
