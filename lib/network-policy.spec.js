const should = require('should')
const fs = require('fs-extra')
const mockLogger = require('../tests/logging.mock')

const { NetpolManager } = require('./network-policy')

describe('NetpolManager', function () {
  it('should generate name by the rule name', function () {
    const netpol = new NetpolManager({})
    const generatedName = netpol.generateNetpolName('foo')
    generatedName.should.equal('npfd-foo')
  })

  it('should generate netpol object by spec', function () {
    const netpol = new NetpolManager({})
    const netpolObj = netpol.generateNetpolObject({
      name: 'test',
      namespace: 'default',
      ruleName: 'test-rule',
      addresses: [
        '192.168.0.1'
      ]
    })
    netpolObj.should.be.an.Object()
    netpolObj.metadata.name.should.equal('test')
  })

  it('should handle a new NPFD crd being added', function (done) {
    const netpol = new NetpolManager({
      logger: mockLogger.getNewMockLogger(),
      kubeAdapter: {
        registerDnsNetworkPolicyHandler: function (fnHander) {
          // in this mock implementation we will just defer a handler call
          setTimeout(() => {
            fnHander({
              type: 'ADDED',
              object: {
                dnsNames: ['dns.names'],
                metadata: {
                  name: 'rule-name',
                  namespace: 'default'
                }
              }
            })
          }, 0)
        }
      }
    })
    netpol.watchDnsNetworkPolicies(function testHandler (dnsTrackObject, eventData) {
      // we expect this to be called
      try {
        eventData.action.should.equal('createOrUpdate')
        done()
      } catch (e) {
        done(e)
      }
    })
  })

  it('should report no difference for equal netpols', function () {
    const np1 = fs.readJsonSync('./tests/netpol-samples/np1-from-k8s.json')
    const np2 = fs.readJsonSync('./tests/netpol-samples/np2-from-gen.json')
    const netpol = new NetpolManager({})

    const res = netpol.reportDiff(np1, np2)
    res.should.be.an.Object()
    should.exists(res.equals)
    res.equals.should.be.true()
  })
})
