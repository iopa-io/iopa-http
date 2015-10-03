# [![IOPA](http://iopa.io/iopa.png)](http://iopa.io)<br> iopa-http

[![Build Status](https://api.shippable.com/projects/TBD/badge?branchName=master)](https://app.shippable.com/projects/TBD) 
[![IOPA](https://img.shields.io/badge/iopa-middleware-99cc33.svg?style=flat-square)](http://iopa.io)
[![limerun](https://img.shields.io/badge/limerun-certified-3399cc.svg?style=flat-square)](https://nodei.co/npm/limerun/)

[![NPM](https://nodei.co/npm/iopa-http.png?downloads=true)](https://nodei.co/npm/iopa-coap/)

## About
`iopa-http` is an API-First fabric for the Internet of Things (IoT) and for Microservices Container-Based Architectures (MCBA)
based on the Internet of Protocols Alliance (IOPA) specification 

It servers HTTP messages in standard IOPA format and allows existing middleware for Connect, Express and limerun projects to consume/send each mesage.

Written in native javascript for maximum performance and portability to constrained devices and services.   If you prefer to use the core Node.js 'http' transport, then
see the package [`iopa-http`](https://nodei.co/npm/iopa-connect/).

## Status

Working Release

Includes:


### Server Functions

  * HTTP/1.1 parser that matches full Node.js 'http' functions
  * Works over TCP, UDP and other IOPA transports
  
### Client Functions
  * HTTP/1.1 formatter and response matcher
  * Works over TCP, UDP and other IOPA transports
  
## Installation

    npm install iopa-http

## Usage
    
### Simple Hello World Server and Client with Pub/Sub
``` js

    

``` 

  
