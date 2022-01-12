
const bunyan = require('bunyan')
const dns = require('dns')

const { KubeAdapter } = require('./lib/kube-adapter')
const { watchDnsNetworkPolicies, generateNetpolObject, generateNetpolName } = require('./lib/network-policy')

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
    const npName = generateNetpolName(dnsTrackObject.ruleName)
    // TODO: namespace support to be added
    const targetNamespace = 'default'
    const existingNetpol = await kubeAdapter.getNetworkPolicyByName(npName)
    // we generate the object for the new netpol anyways, so it can be compared to the existing one
    const npResource = generateNetpolObject({
      name: npName,
      namespace: targetNamespace,
      addresses: addresses.map(addrObj => addrObj.address),
      ruleName: dnsTrackObject.ruleName
    })
    if (existingNetpol) {
      // TODO: first check for label 'npfd-generated-from' and error if this is not present --> we should not touch it
      // TODO: check and compare if we are in align
    } else {
      logger.debug({ npName, ruleName: dnsTrackObject.ruleName, netpolResouce: npResource }, 'attempting to generate a new netpol')
      await kubeAdapter.createNetworkPolicy(npResource, targetNamespace)
      logger.info({ npName, ruleName: dnsTrackObject.ruleName, dnsName }, 'netpol created')
    }
  })
}

async function main () {
  try {
    await kubeAdapter.initKubernetesClient()
    await kubeAdapter.assertCrdExists()

    // watch for entries
    watchDnsNetworkPolicies((dnsTrackObject, eventData) => {
      if (eventData.action === 'createOrUpdate') {
        pollDns(dnsTrackObject)
      } else {
        logger.error({ dnsTrackObject, eventData, action: eventData.action }, 'action handler not implemented yet')
      }
    })
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
