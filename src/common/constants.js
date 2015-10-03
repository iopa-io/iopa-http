/*
 * Copyright (c) 2015 Internet of Protocols Alliance (IOPA)
 * Portions Copyright Node.js contributors. 
 * Portions Copyright Tim Caswell and other contributors.
 * See THIRDPARTY for details of original licenses.
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
const  packageVersion = require('../../package.json').version;

const HTTP = {
  CACHE_CONTROL: "private, s-maxage=0, max-age=0, must-revalidate",
  SERVER: "iopa/" + packageVersion,
  SESSIONCLOSE: "http.SessionClose",
  PROTOCOLVERSION: "1.1",
  
  ShouldKeepAlive: "http.ShouldKeepAlive",
  SkipBody: "http.SkipBody",
  CAPABILITY: "urn:io.iopa:http",

  METHODS: [
    'CHECKOUT',
    'CONNECT',
    'COPY',
    'DELETE',
    'GET',
    'HEAD',
    'LOCK',
    'M-SEARCH',
    'MERGE',
    'MKACTIVITY',
    'MKCALENDAR',
    'MKCOL',
    'MOVE',
    'NOTIFY',
    'OPTIONS',
    'PATCH',
    'POST',
    'PROPFIND',
    'PROPPATCH',
    'PURGE',
    'PUT',
    'REPORT',
    'SEARCH',
    'SUBSCRIBE',
    'TRACE',
    'UNLOCK',
    'UNSUBSCRIBE',
  ]
}

  // MODULE EXPORTS
 
module.exports.HTTP = HTTP;