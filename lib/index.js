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
// 				console.log(api);
				resolve({
					api:api,
					middleware:{
						validateRequest:this.validateRequest,
						parseRequest:this.parseRequest,
						router:this.router(api,modules,middlewares)
					}
				});
			}).catch((err)=>{
				console.log(err);
			})
		});
	}
	static validateRequest(ctx,next){
		
	}
	static parseRequest(ctx,next){
		
	}
	static validate(params){
		return (ctx,next)=>{
			let schema = {
				properties:{},
				required:[]
			};
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
						console.log(item.schema.properties.contacts);
						break;
					case "header":
						val = ctx.request.header[item.name];
						schema.properties[item.name]={
							type:item.type
						};
						break;
				}
				data[item.name]=val;
				
				if(item.required){
					schema.required.push(item.name);
				}
			});
			let validate = ajv.compile(schema);
			if(validate(data)){
				ctx.req.swaggerParams = data;
				return next();
			}else{
				ctx.throw(404,{messages:validate.errors});
			}
		};
	}
	static router(api,modules,middlewares){
		let router = new Router({
			prefix:api.basePath
		});
		_.toPairs(api.paths).forEach(([path,methods])=>{			
			let path2routerPath = path.replace(/(\{(\w*)\})/g, ":$2");
			let run = [
				path2routerPath
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
				run.push(this.validate(detail.parameters));
				
				let run_middlewares=[];
				if(!_.isUndefined(detail["x-middleware"])){
					run_middlewares = detail["x-middleware"];
				}
// 				console.log(global_middleware.concat(run_middlewares));
				global_middleware.concat(run_middlewares).forEach((item)=>{
					console.log(middlewares,middlewares[item]);
					if(!_.isUndefined(middlewares[item])){
						if(typeof(item)=="string"){
							run.push(middlewares[item]);
						}else if(typeof(item)=="object"){
							run.push(middlewares[item.name](...item.params));
						}
					}else{
						
					}
				});
// 				console.log(run);
				
				try{
// 					console.log(api);
					if(!_.isUndefined(api[method])){
						run.push(api[method]);
					}else{
						throw {};
					}
					
				}catch(err){
					console.log(err);
					run.push((ctx,next)=>{	
						return ctx.throw(404,{messages:"not module"});
					})
				}
				
// 				console.log(run);
				router[method](...run);
			});
		});
		
		return router.routes();
	}
}