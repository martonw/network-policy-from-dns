const EventEmitter = require('events')
const Client = require('kubernetes-client').Client
const config = require('kubernetes-client').config
const JSONStream = require('json-stream')

const bunyan = require('bunyan')

const crdDefinition = require('../dnsnetworkpolicy-crd.json')

let logger = null
class KubeAdapter extends EventEmitter {
  constructor (options) {
    super()
    this.options = options
    logger = options.logger || bunyan.createLogger({ name: 'kube-adapter', level: 'trace' })
  }

  async initKubernetesClient () {
    this.client = new Client({ config: config.fromKubeconfig() })
    await this.client.loadSpec()
    logger.info({}, 'kube context loaded')
  }

  async assertCrdExists () {
    // Create the CRD if it doesn't already exist.
    try {
      logger.debug({}, 'Try to create crd definition - assuming it is not exists')
      await this.client.apis['apiextensions.k8s.io'].v1beta1.crd.post({ body: crdDefinition })
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
    this.client.addCustomResourceDefinition(crdDefinition)
  }

  async registerDnsNetworkPolicyHandler (handlerFunc) {
    const stream = this.client.apis['alpaca.markets'].v1beta1.watch.dnsnetworkpolicies.getStream()
    const jsonStream = new JSONStream()
    stream.pipe(jsonStream)

    jsonStream.on('data', async event => {
      logger.debug({ obj: event.object, eventType: event.type }, 'event recived for a DnsNetworkPolicy')
      // TODO: add validations..
      handlerFunc(event)
    })

    jsonStream.on('error', this.emit)
  }

  async getNetworkPolicyByName (npName, namespace) {
    if (!namespace) {
      namespace = 'default'
    }
    try {
      const np = await this.client.apis['networking.k8s.io'].v1.namespaces(namespace).networkpolicies(npName).get()
      logger.debug({ namespace, npName, netpol: np }, 'netpol fetched by name')
      return np
    } catch (e) {
      if (e && e.code && e.code === 404) {
        logger.debug({ err: e, namespace, npName }, 'netpol not found')
        return null
      } else {
        logger.error({ err: e, namespace, npName }, 'unexpected error while fetching netpol resouce by name')
        throw e
      }
    }
  }

  async createNetworkPolicy (npResouceObject, namespace) {
    if (!namespace) {
      throw new Error('Namespace must be specified')
    }
    try {
      const res = await this.client.apis['networking.k8s.io'].v1.namespaces(namespace).networkpolicies.post({ body: npResouceObject })
      logger.debug({ res, namespace }, 'netpol was created successfully')
    } catch (e) {
      logger.error({ err: e, resouceDef: npResouceObject, namespace }, 'failed to create netpol')
      throw e
    }
  }
}

module.exports = {
  KubeAdapter
}
