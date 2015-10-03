/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const iopa = require('iopa'),
  iopaStream = require('iopa-common-stream'),
  httpFormat = require('../common/httpFormat')
  
const constants = iopa.constants,
  IOPA = constants.IOPA,
  SERVER = constants.SERVER,
  HTTP = require('../common/constants.js').HTTP

const packageVersion = require('../../package.json').version;
 
 /**
 * IOPA Middleware for Hypertext Transfer Protocol (HTTP) protocol
 *
 * @class IopaHttp
 * @this app.properties  the IOPA AppBuilder Properties Dictionary, used to add server.capabilities
 * @constructor
 * @public
 */
function IopaHttp(app) {
    app.properties[SERVER.Capabilities][HTTP.CAPABILITY] = {};
    app.properties[SERVER.Capabilities][HTTP.CAPABILITY][SERVER.Version] = packageVersion;
    app.properties[SERVER.Capabilities][HTTP.CAPABILITY][IOPA.Protocol] = HTTP.PROTOCOLVERSION;
 }

/**
 * channel method called for each inbound transport session channel
 * 
 * @method channel
 * @this DiscoveryServerIopaWire 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.channel = function IopaHttp_channel(channelContext, next) {
    channelContext[IOPA.Events].on(IOPA.EVENTS.Request, function(context){
         context.using(next.invoke);
     })
         
      return next()
      .then(httpFormat.inboundParseMonitor.bind(this, channelContext, null))
}

/**
 * channel method called for each inbound message
 * 
 * @method invoke
 * @this DiscoveryServerIopaWire 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.invoke = function IopaHttp_invoke(context, next) {
    context.response[IOPA.Body].on("start", IopaHttp_messageDefaults.bind(this, context.response));   
    return next()
}

/**
 * connect method called for each outbound client.connect() channelContext creation
 * 
 * @method connect
 * @this DiscoveryServerIopaWire 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.connect = function IopaHttp_connect(channelContext, next) {
  channelContext[SERVER.Capabilities][HTTP.CAPABILITY].currentOutgoing = null;
  channelContext[SERVER.Capabilities][HTTP.CAPABILITY].outgoing = [];
  httpFormat.inboundParseMonitor(channelContext, null);  
  return next();
};

/**
 * dispatch method called for each outbound context write
 * 
 * @method dispatch
 * @this DiscoveryServerIopaWire 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.dispatch = function IopaHttp_dispatch(context, next) {
    IopaHttp_messageDefaults(context);
    return next().then(function () {
       return httpFormat.outboundWrite(context);
     });
};

// PRIVATE METHODS

/**
 * Private method to create message defaults for each new packet
 * 
 * @method IopaHttp_messageDefaults
 * @object ctx IOPA context dictionary
 * @private
 */
function IopaHttp_messageDefaults(context) { 
  context[IOPA.Headers]['cache-control'] =  context[IOPA.Headers]['cache-control'] || HTTP.CACHE_CONTROL;
  context[IOPA.Headers]['server'] =  context[IOPA.Headers]['server'] || HTTP.SERVER;
};
 
 // MODULE EXPORTS
 
 module.exports = IopaHttp;
 