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

// DEPENDENCIES
const constants = require('iopa').constants,
    IOPA = constants.IOPA,
    SERVER = constants.SERVER
    
        
const PIPELINE = {CAPABILITY: "urn:io.iopa:pipeline",
        SENT: "pipelinematch.Sent"
          }
 
 const packageVersion = require('../../package.json').version;
  
/**
 * IOPA Middleware 
 *
 * @class BackForth
 * @this app.properties  the IOPA AppBuilder Properties Dictionary, used to add server.capabilities
 * @constructor
 * @public
 */
function PipelineMatch(app) {
     app.properties[SERVER.Capabilities][PIPELINE.CAPABILITY] = {};
     app.properties[SERVER.Capabilities][PIPELINE.CAPABILITY][SERVER.Version] = packageVersion;
}

/**
 * @method invoke
 * @this context IOPA context dictionary
 * @param next   IOPA application delegate for the remainder of the pipeline
 */
PipelineMatch.prototype.channel = function BackForth_invoke(context, next) {
     context[IOPA.Events].on(IOPA.EVENTS.Response, this._client_invokeOnParentResponse.bind(this, context));
    return next();
};

/**
 * @method connect
 * @this context IOPA context dictionary
 * @param next   IOPA application delegate for the remainder of the pipeline
 */
PipelineMatch.prototype.connect = function BackForth_connect(channelContext, next) {
     channelContext[IOPA.Events].on(IOPA.EVENTS.Response, this._client_invokeOnParentResponse.bind(this, channelContext));
     channelContext[SERVER.Capabilities][PIPELINE.CAPABILITY][PIPELINE.SENT] = [];
    return next();
};


PipelineMatch.prototype.dispatch = function BackForth_dispatch(context, next){
    context[SERVER.ParentContext][SERVER.Capabilities][PIPELINE.CAPABILITY][PIPELINE.SENT].push(context);
    return next();
};

/**
 * @method _client_invokeOnParentResponse
 * @this context IOPA parent context dictionary
 * @param context IOPA childResponse context dictionary
 * @param next   IOPA application delegate for the remainder of the pipeline
 */
PipelineMatch.prototype._client_invokeOnParentResponse = function BackForth_client_invokeOnParentResponse(parentContext, response) {
    if ((PIPELINE.SENT in  parentContext[SERVER.Capabilities][PIPELINE.CAPABILITY])
     && (parentContext[SERVER.Capabilities][PIPELINE.CAPABILITY][PIPELINE.SENT].length > 0))
   {
        var childRequest = parentContext[SERVER.Capabilities][PIPELINE.CAPABILITY][PIPELINE.SENT].shift();
        if (childRequest[IOPA.Events])
          childRequest[IOPA.Events].emit(IOPA.EVENTS.Response, response);
   }
};

module.exports = PipelineMatch;