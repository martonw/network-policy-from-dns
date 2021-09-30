const Client = require('kubernetes-client').Client
const config = require('kubernetes-client').config
const JSONStream = require('json-stream')
const bunyan = require('bunyan')
const dns = require('dns')

const logger = bunyan.createLogger({ name: 'dns-network-policy-generator', level: 'trace' })

const crdDefinition = require('./dnsnetworkpolicy-crd.json')

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

function watchDnsNetworkPolicies (client) {
  logger.info({}, 'Start watching dnsnetworkpolicies')
  const stream = client.apis['alpaca.markets'].v1beta1.watch.dnsnetworkpolicies.getStream()
  const jsonStream = new JSONStream()
  stream.pipe(jsonStream)

  jsonStream.on('data', async event => {
    logger.debug({ obj: event.object, eventType: event.type }, 'event recived for a DnsNetworkPolicy')
    // TODO: add validations..
    if (event.type === 'ADDED') {
      const dnsTrackObject = {
        dnsRecords: event.object.dnsNames,
        ruleName: event.object.metadata.name,
        ruleNamespace: event.object.metadata.namespace
      }
      pollDns(dnsTrackObject)
    } else if (event.type === 'DELETED') {
      // implement
    } else {
      logger.error({ obj: event.object, eventType: event.type }, 'no handler logic implemented for event!')
    }
  })
}

async function main () {
  try {
    const client = new Client({ config: config.fromKubeconfig() })
    await client.loadSpec()
    logger.info({}, 'kube context loaded')

    // Create the CRD if it doesn't already exist.
    try {
      logger.debug({}, 'Try to create crd definition - assuming it is not exists')
      await client.apis['apiextensions.k8s.io'].v1beta1.crd.post({ body: crdDefinition })
      logger.info({}, 'CRD created')
    } catch (err) {
      // API returns a 409 Conflict if CRD already exists.
      if (err.statusCode === 409) {
        logger.debug({}, 'crd already exists')
      } else {
        throw err
      }
    }

    // Add endpoints to our client
    client.addCustomResourceDefinition(crdDefinition)

    // watch for entries
    watchDnsNetworkPolicies(client)
  } catch (err) {
    console.error('Error: ', err)
  }
}

main()
