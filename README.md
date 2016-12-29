# npm-koa-swagger-middleware
swagger2.0 koa middleware


**warning**

目前還在實驗階段

## the init example

```

swaggerMiddleware.init(`[you document path]`,modules,middlewares).then(({api,middleware})=>{	
	app.use(middleware.router);
	app.listen(80);
});

```

## import custom api module & middleware

### api document example

```
	coming soon
```


### api module example

```
{
	me:{
		profile:{
			get:[function ...],
			post:[function ...],
			patch:[function ...],
			delete:[function ...]
		}
	}
}

```

### middleware exmaple

```
	coming soon
```
