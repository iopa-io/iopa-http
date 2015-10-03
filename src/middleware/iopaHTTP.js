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
  SERVER = constants.SERVER

const  packageVersion = require('../../package.json').version;
const HTTP = {
  CACHE_CONTROL: "private, s-maxage=0, max-age=0, must-revalidate",
  SERVER: "iopa/" + packageVersion,
  SESSIONCLOSE: "http.SessionClose",
  CAPABILITY: "urn:io.iopa:http"
}

 /**
 * IOPA Middleware for Hypertext Transfer Protocol (HTTP) protocol
 *
 * @class IopaHttp
 * @this app.properties  the IOPA AppBuilder Properties Dictionary, used to add server.capabilities
 * @constructor
 * @public
 */
function IopaHttp(app) {
  this.app = app;
  this._factory = new iopa.Factory();
 }

/**
 * @method invoke
 * @this DiscoveryServerIopaWire 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.channel = function IopaHttp_channel(channelContext, next) {
    channelContext[IOPA.Events].on(IOPA.EVENTS.Request, function(context){
         context.response[IOPA.Body].on("start", IopaHttp_replyStart.bind(this, context));
         context.using(next.invoke);
     })
     
      return next()
      .then(httpFormat.inboundParseMonitor.bind(this, channelContext, null))
}

/**
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
 * @method dispatch
 * @this DiscoveryServerIopaWire 
 * @param context IOPA context properties dictionary
 * @param next the next IOPA AppFunc in pipeline 
 */
IopaHttp.prototype.dispatch = function IopaHttp_dispatch(context, next) {
    return next().then(function () {
       return httpFormat.write(context);
     });
};

/**
 * Private method to send response packet
 * Triggered on data or finish events
 * 
 * @method IopaHttp_reply
 * @object ctx IOPA context dictionary
 * @private
 */
function IopaHttp_replyStart(context) {
        
  var response = context.response;
  response[IOPA.Method] = null;

  response[IOPA.StatusCode] = 200;
  response[IOPA.ReasonPhrase] = "OK";
  var headers = response[IOPA.Headers];
  headers['CACHE-CONTROL'] = headers['CACHE-CONTROL'] || HTTP.CACHE_CONTROL;
  headers['DATE'] = headers['DATE'] || new Date().toUTCString();
};
 
 module.exports = IopaHttp;
 