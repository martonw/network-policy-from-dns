
const bunyan = require('bunyan')

let logger
class NetpolManager {
  constructor (options) {
    this.options = options
    this.logger = options.logger || bunyan.createLogger({ name: 'netpol-manager', level: 'trace' })
    logger = this.logger
    this.kubeAdapter = options.kubeAdapter
  }

  watchDnsNetworkPolicies (eventHandler) {
    logger.info({}, 'Start watching dnsnetworkpolicies')
    this.kubeAdapter.registerDnsNetworkPolicyHandler((event) => {
      if (event.type === 'ADDED') {
        const dnsTrackObject = {
          dnsRecords: event.object.dnsNames,
          ruleName: event.object.metadata.name,
          ruleNamespace: event.object.metadata.namespace
        }
        // pollDns(dnsTrackObject)
        eventHandler(dnsTrackObject, {
          action: 'createOrUpdate'
        })
      } else if (event.type === 'DELETED') {
        // TODO: implement
      } else {
        logger.error({ obj: event.object, eventType: event.type }, 'no handler logic implemented for event!')
      }
    })
  }

  generateNetpolObject (netpolData) {
    return {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: netpolData.name,
        namespace: netpolData.namespace,
        labels: {
          'generated-by': 'npfd',
          'npfd-generated-from': netpolData.ruleName
        }
      },
      spec: {
        egress: [
          {
            to: netpolData.addresses.map(addr => {
              return {
                ipBlock: {
                  cidr: `${addr}/32`
                }
              }
            })
          }
        ],
        podSelector: {},
        policyTypes: [
          'Egress'
        ]
      }
    }
  }

  generateNetpolName (ruleName) {
    // Later could be refactored to a layered config mangement
    const npNamePrefix = process.env.NETPOL_NAME_PREFIX || 'npfd-'
    // for now we jsut assume that length will not be too long and allowed character set is also fine
    return npNamePrefix + ruleName
  }

  reportDiff (np1, np2) {
    logger.debug({ np1, np2 }, 'TODO implement diffing')
    return {}
  }
}

module.exports = {
  NetpolManager
}
