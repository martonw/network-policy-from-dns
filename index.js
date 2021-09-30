
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
  dns.resolve4(dnsName, { ttl: true }, (err, addresses) => {
    if (err) {
      logger.error({ err, dnsName, ruleName: dnsTrackObject.ruleName }, 'failed to resolve dns record')
      return
    }
    logger.debug({ addresses, dnsName, ruleName: dnsTrackObject.ruleName }, 'dns resolved')
  })
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
