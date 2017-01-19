var parser = require('swagger-parser');
var koa = require("koa");
var validate = require("./validate");
var Router = require("koa-router");
var _ = require("lodash");
var Ajv = require("ajv");

const ajv = new Ajv();

module.exports = class {
	static init(api_path,modules={},middlewares={}){
		return new Promise((resolve,reject)=>{
			parser.validate(api_path).then((api)=>{
				resolve({
					api:api,
					middleware:{
						router:this.router(api,modules,middlewares)
					}
				});
			}).catch((err)=>{
				console.log(err);
			})
		});
	}
	
	static validate(params){
		return (ctx,next)=>{
			console.log("validate");
			let schema = {
				properties:{},
				required:[]
			};
			
			if([null,undefined].indexOf(params)!=-1){
				return next();
			}
			
			let data = {};
			params.forEach((item)=>{
				console.log(item);
				let val=null;
				switch(item.in){
					case "path":
						val = ctx.params[item.name];
						schema.properties[item.name]={
							type:item.type
						};
						break;
					case "body":
						val = ctx.request.body;
						schema.properties[item.name]=item.schema;
// 						console.log(item.schema.properties.contacts);
						break;
					case "header":
						val = ctx.request.header[item.name];
						schema.properties[item.name]={
							type:item.type
						};
						break;
					case "query":
						val = ctx.query[item.name];
						schema.properties[item.name]={
							type:item.type
						};
						break;
				}
				
				if(item.type=="number"&&parseInt(val)!=NaN){
					val = new Number(val);
				}
				data[item.name]=val;
				
				if(item.required){
					schema.required.push(item.name);
				}
			});
			let validate = ajv.compile(schema);
			if(validate(data)){
				ctx.define.params = data;
				return next();
			}else{
				ctx.throw(404,{messages:validate.errors});
			}
		};
	}
	/*
		bind docs to request
		and
		init define
			model: save data model class
			params: save shared value
			
	*/
	static bindDocs(api){
		return (ctx,next)=>{
			ctx.swaggerDocs = api;
			ctx.define={
				model:{
					
				},
				params:{
					
				}
			}
			return next();
		}
	}
	
	static router(api,modules,middlewares){
		let router = new Router({
			prefix:api.basePath
		});
		let bindDocs = this.bindDocs(api);
		_.toPairs(api.paths).forEach(([path,methods])=>{			
			let path2routerPath = path.replace(/(\{(\w*)\})/g, ":$2");
			let prefix_middleware = [
				path2routerPath,
				bindDocs
			]
			if( _.isUndefined(methods["x-run"]) ||
				_.isUndefined(methods["x-run"]["controller"]||
				_.isUndefined(methods["x-run"]["action"]))
			){
				return;
			}
			let api =null
			try{
				api = modules[methods["x-run"]["controller"]][methods["x-run"]["action"]];
			}catch(e){
				return;
			}
			
			
			
			let global_middleware = [];
			
			if(!_.isUndefined(methods["x-middleware"])){
				global_middleware = methods["x-middleware"];
			}
			
			_.toPairs(methods).forEach(([method,detail])=>{
				if(["get","post","patch","delete","put"].indexOf(method)==-1){
					return;
				}
				
				let module_middlewares=[];
				let run_middleware = [];
				if(!_.isUndefined(detail["x-middleware"])){
					module_middlewares = detail["x-middleware"];
				}
				global_middleware.concat(module_middlewares).forEach((item)=>{
					if(typeof(item)=="string"&&!_.isUndefined(middlewares[item])){
						run_middleware.push(middlewares[item]);
					}else if(typeof(item)=="object"&&!_.isUndefined(middlewares[item.name])){
						switch(typeof(item.params)){
							case "object":
								run_middleware.push(middlewares[item.name](item.params));
								break;
							case "array":
								run_middleware.push(middlewares[item.name](...item.params));
								break;
							default:
								run_middleware.push(middlewares[item.name]());
								break;
						}
					}
				});
				
				let last_module = (ctx,next)=>{	
					return ctx.throw(404,{messages:"not module"});
				};
				try{
					if(!_.isUndefined(api[method])){
						last_module = api[method];
					}
				}catch(e){
					console.error(e);
				}
				
				let all = prefix_middleware
					.concat([this.validate(detail.parameters)])
					.concat(run_middleware)
					.concat([last_module]);
// 				console.log(all);
				router[method](...all);
			});
		});
		
		return router.routes();
	}
}