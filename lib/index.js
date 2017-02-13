var parser = require('swagger-parser');
var koa = require("koa");
// var validate = require("./validate");
var Router = require("koa-router");
var _ = require("lodash");
var Ajv = require("ajv");
const ajv = new Ajv();
var _mongoose = null;



module.exports = class {
	static init({
		api_path="",
		modules={},
		middlewares={},
		mongoose=null
	}){
		_mongoose = mongoose;
		return new Promise((resolve,reject)=>{
			parser.validate(api_path,{
				$refs: {
				    internal: true   // Don't dereference internal $refs, only external
				}
			}).then((api)=>{
				var result = {
					api:api,
					router:this.router(api,modules,middlewares),
					models:this.models(api)
				};
				resolve(result);
			}).catch((err)=>{
				console.log(err);
			})
		});
	}
	/*
		HTTP參數驗證
	*/
	static validate(params){
		return (ctx,next)=>{
			let schema = {
				properties:{},
				required:[]
			};
			
			if([null,undefined].indexOf(params)!=-1){
				return next();
			}
			
			let data = {};
			params.forEach((item)=>{
				let val=null;
				
				if(["path","header","query"].indexOf(item.in)!=-1){
					switch(item.in){
						case "path":
							val = ctx.params[item.name];
							break;
						case "header":
							val = ctx.request.header[item.name];
							break;
						case "query":
							val = ctx.query[item.name];
							break;
					}
					schema.properties[item.name]={
						type:item.type
					};
				}
				
				if(item.in=="body"&&ctx.is("json")){
					val = ctx.request.body[item.name];
				}
				
				if(item.in=="formData"){
					if(ctx.is("urlencoded")){
						val = ctx.request.body[item.name];
						schema.properties[item.name]={
							type:item.type
						};
					}else if(ctx.is("multipart")){
						if(item.type=="file"){
							val = ctx.request.body.files[item.name];
							schema.properties[item.name]={
								type:"object"
							};
						}else{
							val = ctx.request.body.fields[item.name];
							schema.properties[item.name]={
								type:item.type
							};
						}
					}
				}
				
				if(item.default!=undefined&&val==undefined){
					val = item.default;
				}
				
				
				if(item.type=="number"&&parseInt(val)!=NaN){
					val = Number(val);
				}
				
				if(!_.isUndefined(val)&&val!="undefined"){
					data[item.name]=val;
				}
				
				
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
	
	/*
		產生mongoose model
	*/
	static models(api){
		var result = {};
		var options = {};
		
		if(_mongoose!=null){
			if(!_.isUndefined(api["x-mongoose"])){
				if(!_.isUndefined(api["x-mongoose"]["schema-options"])){
					options = Object.assign(options,api["x-mongoose"]["schema-options"]);
				}
			}
			
			_.toPairs(api.definitions).forEach(([modelName,data])=>{
				if(!_.isUndefined(data["x-mongoose"])){
					if(data["x-mongoose"]["exclude"]){
						return;
					}
				}
				var schema = this.__mapProperty(data);
				result[modelName] = _mongoose.model(modelName,new _mongoose.Schema(schema,options));
			});
		}
		
		
		return (ctx,next)=>{
			ctx.models = result;
			return next();
		};
		
	}
	
	static __mapProperty(property){
		var result = {};
		var required = [];
		var unique = [];
		var index = [];
		if(property["required"]!=undefined){
			required = property["required"];
		}
		
		if(property["x-mongoose"]!=undefined&&property["x-mongoose"]["schema-options"]!=undefined){
			if(property["x-mongoose"]["schema-options"]["unique"]!=undefined){
				unique=property["x-mongoose"]["schema-options"]["unique"];
			}
			if(property["x-mongoose"]["schema-options"]["index"]!=undefined){
				unique=property["x-mongoose"]["schema-options"]["index"];
			}
		}
		_.toPairs(property.properties).forEach(([propertyName,value])=>{
			result[propertyName]=this.__converType(value);
			result[propertyName].required = (required.indexOf(propertyName)!=-1);
			if(unique.indexOf(propertyName)!=-1){
				result[propertyName].index = {unique:true,index:true};
			}else if(index.indexOf(propertyName)!=-1){
				result[propertyName].index = {unique:false,index:true};
			}
			
		});
// 		console.log(result);
		return result;
	}
	
	static __converType(property){
		var result = {};
		switch(property.type){
			case "number":
				property.type= Number;
			break;
			case "string":
				property.type= String
			break;
			case "object":
				return this.__mapProperty(property);
			break;
			case "boolean":
				property.type= Boolean
				break;
			case "array":
				return [this.__mapProperty(property.items)]
			break;
		}
		return property;
	}
	
	
	/*
		產生Swagger中的Router並對應到Controller中
	*/
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
				router[method](...all);
			});
		});
		
		return router.routes();
	}
}
