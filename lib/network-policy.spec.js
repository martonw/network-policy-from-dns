require('should')

const { NetpolManager } = require('./network-policy')

describe('NetpolManager', function () {
  it('should generate name by the rule name', function () {
    const netpol = new NetpolManager({})
    const generatedName = netpol.generateNetpolName('foo')
    generatedName.should.equal('npfd-foo')
  })
})
