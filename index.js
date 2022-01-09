
const bunyan = require('bunyan')
const dns = require('dns')

const { KubeAdapter } = require('./lib/kube-adapter')

const logger = bunyan.createLogger({ name: 'dns-network-policy-generator', level: 'trace' })

const kubeAdapter = new KubeAdapter({
  logger
})

// lookup for setTimeout handlers
// const pollDnsTimers = {}
function pollDns (dnsTrackObject) {
  // for now, we just handle a single dns entry
  if (dnsTrackObject.dnsRecords.length !== 1) {
    logger.error({ dnsRecords: dnsTrackObject.dnsRecords }, 'as of now, we only support single dns entries.')
    return
  }
  const dnsName = dnsTrackObject.dnsRecords[0].dns
  dns.resolve4(dnsName, { ttl: true }, async (err, addresses) => {
    if (err) {
      logger.error({ err, dnsName, ruleName: dnsTrackObject.ruleName }, 'failed to resolve dns record')
      return
    }
    logger.debug({ addresses, dnsName, ruleName: dnsTrackObject.ruleName }, 'dns resolved')
    const npName = getNetpolName(dnsTrackObject.ruleName)
    // TODO: namespace support to be added
    const targetNamespace = 'default'
    const existingNetpol = await kubeAdapter.getNetworkPolicyByName(npName)
    if (existingNetpol) {
      // TODO: first check for label 'npfd-generated-from' and error if this is not present --> we should not touch it
      // TODO: check and compare if we are in align
    } else {
      // no such netpol yet, lets go ahead and create it
      const npResource = generateNetpolObject({
        name: npName,
        namespace: targetNamespace,
        addresses: addresses.map(addrObj => addrObj.address),
        ruleName: dnsTrackObject.ruleName
      })
      logger.debug({ npName, ruleName: dnsTrackObject.ruleName, netpolResouce: npResource }, 'attempting to generate a new netpol')
      // actually create it
      await kubeAdapter.createNetworkPolicy(npResource, targetNamespace)
      logger.info({ npName, ruleName: dnsTrackObject.ruleName, dnsName }, 'netpol created')
    }
  })
}

function getNetpolName (ruleName) {
  // Later could be refactored to a layered config mangement
  const npNamePrefix = process.env.NETPOL_NAME_PREFIX || 'npfd-'
  // for now we jsut assume that length will not be too long and allowed character set is also fine
  return npNamePrefix + ruleName
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

function watchDnsNetworkPolicies () {
  logger.info({}, 'Start watching dnsnetworkpolicies')
  kubeAdapter.registerDnsNetworkPolicyHandler((event) => {
    if (event.type === 'ADDED') {
      const dnsTrackObject = {
        dnsRecords: event.object.dnsNames,
        ruleName: event.object.metadata.name,
        ruleNamespace: event.object.metadata.namespace
      }
      pollDns(dnsTrackObject)
    } else if (event.type === 'DELETED') {
      // TODO: implement
    } else {
      logger.error({ obj: event.object, eventType: event.type }, 'no handler logic implemented for event!')
    }
  })
}

async function main () {
  try {
    await kubeAdapter.initKubernetesClient()
    await kubeAdapter.assertCrdExists()

    // watch for entries
    watchDnsNetworkPolicies()
  } catch (err) {
    console.error('Error: ', err)
    process.exit(1)
  }

  kubeAdapter.on('error', (err) => {
    logger.fatal({ err }, 'Received error event on the kubernetes json stream')
    process.exit(2)
  })
}

main()
