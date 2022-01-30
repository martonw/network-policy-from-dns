class MockLogger {
  constructor () {
    this.errors = 0
    this.warnings = 0
  }

  error () { this.errors++ }
  warn () { this.warnings++ }
  info () {}
  debug () {}
  trace () {}

  getMockProblemsCounter () {
    return this.errors + this.warnings
  }
}

module.exports = {
  getNewMockLogger: function (name) {
    return new MockLogger(name)
  }
}
