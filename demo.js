/*
 * Copyright (c) 2016 Internet of Protocols Alliance (IOPA)
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

/**
 * Constants and declarations
 */
 
global.Promise = require('bluebird');

const iopa = require('iopa')
  
const IopaTCP =  require('iopa-tcp'),
    IopaHTTP = require('./index.js'),
    IopaMessageLogger = require('iopa-logger').MessageLogger
  
var app = new iopa.App();
app.use(IopaTCP);
app.use(IopaHTTP);
app.use(IopaMessageLogger);

app.use(function (context, next) {
  return context.response["iopa.Body"].endAsync("<HTML><HEAD></HEAD><BODY>Hello World</BODY>").then(next);
});

var server = app.createServer("tcp:");
server.listen()
  .then(function () {
     console.log("Server is listening on port " + server.port);
     return server.connect("http://localhost:" + server.port);})
  .then(function(client) {
      return client.create("/", "GET").send();
       })
  .then(function (response) {
      response["iopa.Body"].pipe(process.stdout);
      server.close();
    });
         
     
   