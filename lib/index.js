var Assert = require('assert');
var Joi = require('joi');

var internals = {
    mongoose: null
};

internals.root = function (mongoose) {

    Assert(mongoose);
    internals.mongoose = mongoose;

    return {
        convert: function (joiSchema) {
            var mongooseSchema = new internals.mongoose.Schema(internals.convert(joiSchema));
            mongooseSchema.pre('validate', function (next) {
                Joi.validate(this, joiSchema, next);
            });
            return mongooseSchema;
        }
    };
};

internals.convert = function (joiObject) {

    if (joiObject === undefined) {
        throw new Error('Ensure the value you\'re trying to convert exists!');
    }
    
    // If this object isn't an object, we're done here
    var result = Joi.validate(joiObject, Joi.object());

    if (result.error) {
        throw result.error;
    }

    if (!joiObject.isJoi) {
        joiObject = Joi.object(joiObject);
    }

    var output = {};

    if (joiObject._meta.length > 0) {

        var toClass = {}.toString;

        // Iterate through the array
        for (var i = 0; i < joiObject._meta.length; i++) {
            // Only add objects
            if (toClass.call(joiObject._meta[i]) !== '[object Object]') {
                continue;
            }

            for (var key in joiObject._meta[i]) {
                output[key] = joiObject._meta[i][key];
            }
        }
    }

    if (joiObject._type === 'object') {
        joiObject._inner.children.forEach(function (child) {

            output[child.key] = internals.convert(child.schema);
        });

        return output;
    }

    // We don't want the required key added onto objects, hence why its here.
    // If it's added onto objects, Mongoose complains because it can't 
    // understand the type 'true'. #truestory #lol
    if (joiObject._flags.presence === 'required') {
        output.required = true;
    }

    if (output.type) {
        return output;
    }

    output.type = internals.typeDeterminer(joiObject);

    // If this is an array, let's get rid of the validation cos it causes major
    // beef with validation
    //if (Array.isArray(output.type)) {
    //    delete output.validate;
    //}

    return output;
};

internals.typeDeterminer = function (joiObject) {

    if (joiObject._type === 'string') {
        return String;
    }

    if (joiObject._type === 'number') {
        return Number;
    }

    if (joiObject._type === 'date') {
        return Date;
    }

    if (joiObject._type === 'boolean') {
        return Boolean;
    }

    var types = {};
    var type = [];
    var i = 0;
    var firstKey;

    if (joiObject._type === 'array') {
        // Go through each of the children in the array and get their types
        for (i = 0; i < joiObject._inner.items.length; i++) {
            if (types[joiObject._inner.items[i]._type]) {
                types[joiObject._inner.items[i]._type]++;
            } else {
                types[joiObject._inner.items[i]._type] = 1;
            }
        }

        // If there are multiple types, there's not much else we can do as far as Mongoose goes...
        if (Object.keys(types).length > 1) {
            type.push(internals.mongoose.Schema.Types.Mixed);
            return type;
        }

        // If there are multiple of the same type, this means that there are different schemas. 
        // This is alright cos we know they're all the same type
        firstKey = Object.keys(types)[0];
        if (types[firstKey] > 1) {
            type.push(internals.typeDeterminer({_type: firstKey}));
            return type;
        }

        if (joiObject._inner.items.length === 0) {
            return type;
        }

        type.push(internals.convert(joiObject._inner.items[0]));
        return type;
    }

    if (joiObject._type === 'alternatives') {
        types = {};

        if (joiObject._inner.matches.length === 0) {
            return internals.mongoose.Schema.Types.Mixed;
        }

        // Go through each of the children in the array and get their types
        for (i = 0; i < joiObject._inner.matches.length; i++) {
            types[joiObject._inner.matches[i].schema._type] = types[joiObject._inner.matches[i].schema._type] ? types[joiObject._inner.matches[i].schema._type] + 1 : types[joiObject._inner.matches[i].schema._type] = 1;
        }

        // If there are multiple types, there's not much else we can do as far as Mongoose goes...
        if (Object.keys(types).length > 1) {
            return internals.mongoose.Schema.Types.Mixed;
        }

        // If there are multiple of the same type, this means that there are different schemas, but the same type :D
        firstKey = Object.keys(types)[0];
        if (types[firstKey] > 1) {
            return internals.typeDeterminer({_type: firstKey});
        }

        // If we're here, it's because there's a single type, and one schema. So actually, an alternative didn't need to be used...
        return internals.typeDeterminer(joiObject._inner.matches[0].schema);
    }

    if (joiObject._type === 'object') {
        return Object;
    }

    if (joiObject._type === 'any') {
        return internals.mongoose.Schema.Types.Mixed;
    }

    throw new TypeError('Unsupported Joi type: "' + joiObject._type + '"! Raise an issue on GitHub if you\'d like it to be added!');
};

module.exports = internals.root;
