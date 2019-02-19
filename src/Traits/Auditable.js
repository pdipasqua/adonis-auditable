'use strict'

const _ = require('lodash')
const Audit = use('App/Models/Audit')

class Auditable {
  register (Model) {
    // create methods
    const self = this
    Model.audit = function () {
      return {
        create: createWithAudit(self.ctx).bind(this)
      }
    }

    // update/delete methods
    Model.prototype.audit = function () {
      return {
        update: updateWithAudit(self.ctx).bind(this),
        delete: deleteWithAudit(self.ctx).bind(this)
      }
    }
  }
}

/**
 * Create with audit
 *
 * @param auth
 * @param request
 * @returns {*}
 */
function createWithAudit ({request, auth}) {
  return async function (data) {
    const model = await this.create(data)
    const newModel = (await this.find(model.primaryKeyValue))
    const auditable = newModel.constructor.name
    const auditableUuid = newModel.uuid
    const newData = newModel.$attributes
    const event = Audit.events.CREATE

    // save audit
    await createAudit(event, {request, auth}, auditable, auditableUuid, null, newData)

    return model
  }
}

/**
 * Update with audit
 *
 * @param auth
 * @param request
 * @returns {*}
 */
function updateWithAudit ({request, auth}) {
  return async function (data, ignoreDiff = ['updated_at']) {
    const auditable = this.constructor.name
    const auditableUuid = this.uuid
    const oldData = this.$originalAttributes
    this.merge(data)
    const result = await this.save()
    const newModel = (await this.constructor.find(this.primaryKeyValue))
    const newData = newModel.$attributes

    // if new and old are equal then don't bother updating
    const isEqual = _.isEqual(
      _.omit(newData, ignoreDiff),
      _.omit(oldData, ignoreDiff)
    )
    if (isEqual) {
      return result
    }

    // update / patch are shared
    const event = Audit.events.UPDATE

    // save audit
    await createAudit(event, {request, auth}, auditable, auditableUuid, oldData, newData)

    return result
  }
}

/**
 * Delete with audit
 *
 * @param auth
 * @param request
 * @returns {*}
 */
function deleteWithAudit ({request, auth}) {
  return async function () {
    const auditable = this.constructor.name
    const auditableUuid = this.uuid
    const oldData = this.$originalAttributes
    const result = await this.delete()

    // save audit
    await createAudit(Audit.events.DELETE, {request, auth}, auditable, auditableUuid, oldData)

    return result
  }
}

/**
 * Run the audit
 *
 * @param event
 * @param oldData
 * @param auditable
 * @param auditableUuid
 * @param newData
 * @param auth
 * @param request
 * @returns {Promise<void>}
 */
async function createAudit (event, {request, auth}, auditable, auditableUuid, oldData, newData) {
  // check request was passed
  if (!request) {
    throw new Error('Request param is empty')
  }

  var entity = null
  if(auth.authenticatorInstance._config.model == 'App/Models/User') {
	  entity = 'user'
  } else {
	  entity = 'customer'
  }
  
  // get user data to store
  const AuthUserUuid = _.get(auth, 'user.uuid' , null)

  const url = request.originalUrl()
  const ip = request.ip()

  // save audit
  await Audit.create({
    user_uuid: entity =='user' ? AuthUserUuid : null,
    customer_uuid: entity =='customer' ? AuthUserUuid : null,
    auditable_uuid: auditableUuid,
    auditable,
    event,
    url,
    ip,
    old_data: oldData,
    new_data: newData,
  })
}

module.exports = Auditable
