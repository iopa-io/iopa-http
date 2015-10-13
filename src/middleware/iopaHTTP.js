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
 * @this IopaHttp 
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
    context.response[IOPA.Body].on("start", context.response.dispatch);   
    return next()
}

/**
 * connect method called for each outbound client.connect() channelContext creation
 * 
 * @method connect
 * @this IopaHttp 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.connect = function IopaHttp_connect(channelContext, next) {
   httpFormat.inboundParseMonitor(channelContext, null);  
  return next();
};

/**
 * dispatch method called for each outbound context write
 * 
 * @method create
 * @this IopaHttp 
 * @param context IOPA context properties dictionary
 */
IopaHttp.prototype.create = function IopaHttp_create(context, next) {
   context[IOPA.Headers]['Cache-Control'] =  context.getHeader('cache-control') || HTTP.CACHE_CONTROL;
   context[IOPA.Headers]['Server'] =  context.getHeader('server') || HTTP.SERVER;
   return next();
};

/**
 * dispatch method called for each outbound context write
 * 
 * @method dispatch
 * @this IopaHttp 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.dispatch = function IopaHttp_dispatch(context, next) {
    return next().then(function () {
       return httpFormat.outboundWrite(context);
     });
};

 // MODULE EXPORTS
 
 module.exports = IopaHttp;
 