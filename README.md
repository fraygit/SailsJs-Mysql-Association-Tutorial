# Sails JS and Waterline Association

For a few weeks now I have been tinkering node.js and in which I am highly considering using on our next project. I reckon node will be the future of web development. Hunting for a MVC framework in node, I stumble upon sails.js. It looks promising and I’ve been following its development ever since. 
Sails.js is still on its early stage and with the release of version 0.10.x recently, I got excited on one of its feature, “Associations”!
In this article, I wanted to share to you a short guide on how to get going with node + sails js and lastly a briefly guide on Associations.

## Node + Sails

To start, you’ll need node.js in your machine. Download and install node from http://nodejs.org/ if haven’t already. Then to start using sails you need to grab the package. To do this, go to your node js console and run

```javascript
> npm install –g sails
```

The –g argument installs the package globally. Now to create a new project, run the command:

```javascript
> sails new MySailsProject
```

This command will create the project folder together with the files. Go to the directory:

```javascript
> cd MySailsProject
```

Then type the command:
```javascript
	> sails lift
```	
Easy as that, you now have a sails.js project running! By default, the project will run on port 1337. You can change the port in *config\local.js*, add the snippet below under module.export:

```javascript
port: <port number>
```

## Controller
Sails comes with generator for creating controller and model. Looking at their trello road map https://trello.com/b/cGzNVE0b/sails-roadmap looks like they’re working on including mocha test in the generator which should be handy. To create a controller:

```javascript
	> sails generate controller Store
```

This will create a *StoreController.js* under *api/controllers*. So, to add an action, simply add a function, e.g.:

```javascript
module.exports = {
	HelloWorld: function (req, res){
		return res.json({Hello: 'Hello World!'});
	}
}
```

The code will be accessible through the url */Store/HelloWorld*.

##MySQL Adapter

Sails comes with Waterline ORM. To interact with the database, we’ll need an adapter, for this instance will add a mysql adpater.

```javascript
> npm install sails-mysql
```

Configure the database connection in *config/connections.js*
```javascript
  someMysqlServer: {
    adapter: 'sails-mysql',
    host: 'localhost',
    user: 'robot',
    port: 3306,
    password: 'Passw0rd123', 
    database: 'prototypeDB'
  },
```

## Model

Creating the model is easy, simply use the generator:

```javascript
	> sails generate model Driver 
```

This will create a file *Driver.js* under *api/Models*. Add the fields under the attribute object:

```javascript
module.exports = {

  attributes: {

  	Name: 'string'

  }
};
```

List of data type http://sailsjs.org/#/documentation/concepts/ORM/Attributes.html
Association

Association is a feature in Waterline wherein you can associate a model with another model across multiple data stores. To specify which data store of the model, simply specify the connection:

```javascript
module.exports = {

  connection: 'someMysqlServer',

  attributes: {

  	Name: {
  		type: 'string',
  	},

  }
};
```

##One to One Association

Take for example we wanted to create a Car that can only be linked one driver and that driver can only be link to a single Car. We’ll generate the Car model:

```javascript
> sails generate model Car
```

Add the fields:

```javascript
module.exports = {
connection: 'someMysqlServer',
  attributes: {
  	Name: {
  		type: 'string',
  	},
  	Brand: {
  		type: 'string'
  	},
  	Model: {
  		type: 'string'
  	},
  	driver: {
  		model: 'Driver',
  		required: false
  	}
  }
};
```

Notice the last attribute driver, we associated the model to the Driver model. We need modify the Driver model to add the association to the car model.

```javascript
module.exports = {
connection: 'someMysqlServer',
  attributes: {
  	Name: {
  		type: 'string',
  	},
  	car: {
  		model: 'Car',
  		required: false
  	}  	
  }
};
```

Now we’ll add a Car controller:

```javascript
> sails generate controller Car
Insert the code in CarController.js
		add: function(req, res){
		var driver = {Name: 'Juan'};
		Driver.create(driver).exec(function(err, result){
			Car.create({
				Name: 'My Car',
				Brand: 'Honda',
				Model: 'Civic',
				driver: result.id
			}).exec(function (e, r){
				Driver.update({id: result.id}, {car: r.id}).exec(function(e1, r1){
					return res.json({result: r, error: e});	
				});				
			});
		});
	}
```

We now have a bit of chained callbacks. What the code does is it:
1.	Create Driver
2.	Create the car then associate the driver
driver: result.id
3.	Update the Driver to associate with the Car
Now retrieving the Car model, you can use the populate function to get the associated model:

```javascript
	viewCar: function(req, res){
		Car.find().populate('driver').exec(function(e, r){
			return res.json({Car: r});
		});
	},
```

Which will spits out:
```javascript
{
  "Car": [
    {
      "driver": {
        "Name": "Juan",
        "id": 1,
        "createdAt": "2014-09-01T00:00:59.000Z",
        "updatedAt": "2014-09-01T00:00:59.000Z",
        "car": 1
      },
      "Name": "My Car",
      "Brand": "Honda",
      "Model": "Civic",
      "id": 1,
      "createdAt": "2014-09-01T00:00:59.000Z",
      "updatedAt": "2014-09-01T00:00:59.000Z"
    }
  ]
}
```

Or you can retrieve the other way around, retrieving the Driver and populate the car:
```javascript
	viewDriver: function(req, res){
		Driver.find().populate('car').exec(function(e, r){
			return res.json({Car: r});
		});
	}	
```	
Which spits out:

```javascript
{
  "Car": [
    {
      "car": {
        "Name": "My Car",
        "Brand": "Honda",
        "Model": "Civic",
        "id": 1,
        "createdAt": "2014-09-01T00:00:59.000Z",
        "updatedAt": "2014-09-01T00:00:59.000Z",
        "driver": 1
      },
      "Name": "Juan",
      "id": 1,
      "createdAt": "2014-09-01T00:00:59.000Z",
      "updatedAt": "2014-09-01T00:00:59.000Z"
    }
  ]
}
```

One to may associations
You can also associate one model with many other models. To do this, take for example, a scenario where you have a store which can have several customers:

**Store.js**

```javascript
module.exports = {

  connection: 'someMysqlServer',

  attributes: {
  	name: {
  		type: 'string'
  	},

  	customers: {
      collection: 'Customer',
      via: 'store'
  	}
  }
};
```

**Customer.js**

```javascript
module.exports = {

  connection: 'someMysqlServer',

  attributes: {

  	Name: {
  		type: 'string',
  	},

  	store: {
  		model: 'Store'
  	}

  }
};
```

Then you can add the customers using the store id

```javascript
	addStoreCustomer: function(req, res){
		Store.create({Name: 'Sari Sari Store'}).exec(function(e,r){
			Customer.create({Name: 'Pedro', store: r.id}).exec(function(err, result){
				Customer.create({Name: 'Juan', store: r.id}).exec(function(err1, res1){
					return res.json({ok: 'success'});
				});
			});
		});
	},
```

Then retrieve the same way by using populate function:

```javascript
	viewStore: function(req, res){
		Store.find().populate('customers').exec(function (err, result){
			res.json({Result: result});
		});
	}
```

Spits out 

```javascript
{
  "Result": [
    {
      "customers": [
        {
          "Name": "Pedro",
          "store": 1,
          "id": 1,
          "createdAt": "2014-09-01T00:30:58.000Z",
          "updatedAt": "2014-09-01T00:30:58.000Z"
        },
        {
          "Name": "Juan",
          "store": 1,
          "id": 2,
          "createdAt": "2014-09-01T00:30:58.000Z",
          "updatedAt": "2014-09-01T00:30:58.000Z"
        }
      ],
      "name": null,
      "id": 1,
      "createdAt": "2014-09-01T00:30:58.000Z",
      "updatedAt": "2014-09-01T00:30:58.000Z"
    }
  ]
}

```