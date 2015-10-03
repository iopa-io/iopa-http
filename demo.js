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

/**
 * Constants and declarations
 */
 
global.Promise = require('bluebird');

const iopa = require('iopa'),
  IOPA = iopa.constants.IOPA,
  SERVER = iopa.constants.SERVER
  
const IopaTCP =  require('iopa-tcp'),
    IopaHTTP = require('./index.js'),
    IopaMessageLogger = require('iopa-logger').MessageLogger

/**
 * Main Application Logic
 */
 
var app = new iopa.App();
app.use(IopaMessageLogger);
app.use(IopaHTTP);

app.use(function (context, next) {
  context.log.info("[DEMO] APP USE " + context["iopa.Method"] + " " + context["iopa.Path"]);
  context.response["iopa.Body"].end("<HTML><HEAD></HEAD><BODY>Hello World</BODY>");
  return next();
});

var server = IopaTCP.createServer(app.build());
server.listen()
    .then(function () {
      console.log("Server is listening on port " + server.port);
      
     return server.connect("http://localhost:" + server.port)
    })
    .then(function(client) {
       console.log("Client is on port " + client[SERVER.LocalPort]);
        return client.send("/", "GET");})
         .then(function (response) {
         console.log("[TEST] /projector RESPONSE ");
         response["iopa.Body"].pipe(process.stdout);
         server.close();
            });
         
     
   