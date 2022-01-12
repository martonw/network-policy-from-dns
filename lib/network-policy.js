
const bunyan = require('bunyan')

const { KubeAdapter } = require('./lib/kube-adapter')

const logger = bunyan.createLogger({ name: 'dns-network-policy-generator', level: 'trace' })

const kubeAdapter = new KubeAdapter({
  logger
})

function watchDnsNetworkPolicies (eventHandler) {
  logger.info({}, 'Start watching dnsnetworkpolicies')
  kubeAdapter.registerDnsNetworkPolicyHandler((event) => {
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

function generateNetpolObject (netpolData) {
  return {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: netpolData.name,
      namespace: netpolData.namespace,
      labels: {
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

function generateNetpolName (ruleName) {
  // Later could be refactored to a layered config mangement
  const npNamePrefix = process.env.NETPOL_NAME_PREFIX || 'npfd-'
  // for now we jsut assume that length will not be too long and allowed character set is also fine
  return npNamePrefix + ruleName
}

module.exports = {
  watchDnsNetworkPolicies,
  generateNetpolObject,
  generateNetpolName
}
