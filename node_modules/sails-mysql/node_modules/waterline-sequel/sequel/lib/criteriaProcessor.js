/**
 * Module dependencies
 */

var _ = require('lodash');
var utils = require('./utils');

var hop = utils.object.hasOwnProperty;

/**
 * Process Criteria
 *
 * Processes a query criteria object
 */

var CriteriaProcessor = module.exports = function CriteriaProcessor(currentTable, schema, options) {

  if(!currentTable || !schema) {
    throw new Error('Incorrect usage of CriteriaProcessor. Must include the currentTable and schema arguments.');
  }

  this.currentTable = currentTable;
  this.schema = schema;
  this.currentSchema = schema[currentTable].attributes;
  this.queryString = '';
  this.values = [];
  this.paramCount = 1;
  this.parameterized = true;
  this.caseSensitive = true;
  this.escapeCharacter = '"';

  if(options && utils.object.hasOwnProperty(options, 'parameterized')) {
    this.parameterized = options.parameterized;
  }

  if(options && utils.object.hasOwnProperty(options, 'caseSensitive')) {
    this.caseSensitive = options.caseSensitive;
  }

  if(options && utils.object.hasOwnProperty(options, 'escapeCharacter')) {
    this.escapeCharacter = options.escapeCharacter;
  }

  if(options && utils.object.hasOwnProperty(options, 'paramCount')) {
    this.paramCount = options.paramCount;
  }

  return this;
};


/**
 * Read criteria object and expand it into a sequel string.
 *
 * @param {Object} options
 */

CriteriaProcessor.prototype.read = function read(options) {

  var self = this;
  var _options;

  if(options.where) {
    _options = options.where;
  }
  else {
    _options = _.cloneDeep(options);
  }

  // Remove SUM, AVERAGE, MAX, MIN
  delete _options.sum;
  delete _options.average;
  delete _options.max;
  delete _options.min;
  delete _options.groupBy;

  if(_options.where !== null) {
    _.keys(_options).forEach(function(key) {
      self.expand(key, _options[key]);
    });
  }

  // Remove trailing 'AND'
  this.queryString = this.queryString.slice(0, -4);

  if(options.groupBy) this.group(options.groupBy);
  if(options.sort) this.sort(options.sort);
  if(hop(options, 'limit')) this.limit(options.limit);

  // Ensure a limit was used if skip was used
  if(hop(options, 'skip') && !hop(options, 'limit')) {
    this.limit(null);
  }

  if(hop(options, 'skip')) this.skip(options.skip);

  return {
    query: this.queryString,
    values: this.values
  };
};


/**
 * Expand a criteria piece.
 *
 * Given a key on a criteria object, expand it into it's sequel parts by inspecting which type
 * of operator to use (`or`, `and`, `in` or `like`) and then recursively process that key if needed.
 *
 * @param {String} key
 * @param {String || Object} val
 * @return
 */

CriteriaProcessor.prototype.expand = function expand(key, val) {

  var self = this;

  switch(key.toLowerCase()) {
    case 'or':
      self.or(val);
      return;

    case 'like':
      self.like(val);
      return;

    // Key/Value
    default:

      // `IN`
      if(val instanceof Array) {
        self._in(key, val);
        return;
      }

      // `AND`
      self.and(key, val);
      return;
  }
};


/**
 * Handle `OR` Criteria
 */

CriteriaProcessor.prototype.or = function or(val) {

  var self = this;

  if(!Array.isArray(val)) {
    throw new Error('`or` statements must be in an array.');
  }

  // Wrap the entire OR clause
  this.queryString += '(';

  val.forEach(function(statement) {
    self.queryString += '(';

    // Recursively call expand. Assumes no nesting of `or` statements
    _.keys(statement).forEach(function(key) {
      self.expand(key, statement[key]);
    });

    if(self.queryString.slice(-4) === 'AND ') {
      self.queryString = self.queryString.slice(0, -5);
    }

    self.queryString += ') OR ';
  });

  // Remove trailing OR if it exists
  if(self.queryString.slice(-3) === 'OR ') {
    self.queryString = self.queryString.slice(0, -4);
  }

  self.queryString += ') AND ';
};


/**
 * Handle `LIKE` Criteria
 */

CriteriaProcessor.prototype.like = function like(val) {

  var self = this;

  var expandBlock = function(parent) {
    var caseSensitive = true;

    // Check if parent is a string, if so make sure it's case sensitive.
    if(self.currentSchema[parent] && self.currentSchema[parent].type === 'text') {
      caseSensitive = false;
    }

    var comparator = this.caseSensitive ? 'ILIKE' : 'LIKE';

    self.process(parent, val[parent], comparator, caseSensitive);
    self.queryString += ' AND ';
  };

  _.keys(val).forEach(function(parent) {
    expandBlock(parent);
  });

};


/**
 * Handle `AND` Criteria
 */

CriteriaProcessor.prototype.and = function and(key, val) {

  var caseSensitive = true;

  // Check if key is a string
  if(this.currentSchema[key] && this.currentSchema[key] === 'string') {
    caseSensitive = false;
  }

  this.process(key, val, '=', caseSensitive);
  this.queryString += ' AND ';
};


/**
 * Handle `IN` Criteria
 */

CriteriaProcessor.prototype._in = function _in(key, val) {

  var self = this;

  // Set case sensitive by default
  var caseSensitivity = true;

  // Set lower logic to false
  var lower = false;

  // Check if key is a string
  if(self.currentSchema[key] && self.currentSchema[key].type === 'text') {
    caseSensitivity = false;
    lower = true;
  }

  // Override caseSensitivity for databases that don't support it
  if(this.caseSensitive) {
    caseSensitivity = false;
  }

  // Check case sensitivity to decide if LOWER logic is used
  if(!caseSensitivity) {
    if(lower) {
      key = 'LOWER(' + utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(key, self.escapeCharacter) + ')';
    } else {
      key = utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(key, self.escapeCharacter);
    }
    self.queryString += key + ' IN (';
  } else {
    self.queryString += utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(key, self.escapeCharacter) + ' IN (';
  }

  // Append each value to query
  val.forEach(function(value) {

    // If case sensitivity if off lowercase the value
    if(!caseSensitivity && _.isString(value)) {
      value = value.toLowerCase();
    }

    // Use either a paramterized value or escaped value
    if(self.parameterized) {
      self.queryString += '$' + self.paramCount + ',';
      self.paramCount++;
    }
    else {
      if(_.isString(value)) {
        value = '"' + utils.escapeString(value) + '"';
      }

      self.queryString += value + ',';
    }

    self.values.push(value);
  });

  // Strip last comma and close criteria
  self.queryString = self.queryString.slice(0, -1) + ')';

  self.queryString += ' AND ';
};


/**
 * Process Criteria
 */

CriteriaProcessor.prototype.process = function process(parent, value, combinator, caseSensitive) {

  var self = this;

  // Override caseSensitivity for databases that don't support it
  if(this.caseSensitive) {
    caseSensitive = false;
  }

  // Expand criteria object
  function expandCriteria(obj) {
    var _param;
    var lower = false;

    _.keys(obj).forEach(function(key) {

      // If value is an object, recursivly expand it
      if(_.isPlainObject(obj[key])) {
        return expandCriteria(obj[key]);
      }

      // Check if key is a string
      if(self.currentSchema[parent] && self.currentSchema[parent].type === 'text') {
        lower = true;
      }

      // Check if value is a string and if so add LOWER logic
      // to work with case in-sensitive queries
      if(!caseSensitive && _.isString(obj[key]) && lower) {
        _param = 'LOWER(' + utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(parent, self.escapeCharacter) + ')';
        obj[key] = obj[key].toLowerCase();
      } else {
        _param = utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(parent, self.escapeCharacter);
      }

      self.queryString += _param + ' ';
      self.prepareCriterion(key, obj[key]);
      self.queryString += ' AND ';
    });
  }

  // Complex Object Attributes
  if(_.isPlainObject(value)) {

    // Expand the Object Criteria
    expandCriteria(value);

    // Remove trailing `AND`
    this.queryString = this.queryString.slice(0, -4);

    return;
  }

  // Set lower logic to true
  var lower = false;

  // Check if parent is a number or anything that can't be lowercased
  if(self.currentSchema[parent] && self.currentSchema[parent].type === 'text') {
    lower = true;
  }

  // Check if value is a string and if so add LOWER logic
  // to work with case in-sensitive queries
  if(!caseSensitive && lower && _.isString(value)) {

    // ADD LOWER to parent
    parent = 'LOWER(' + utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(parent, self.escapeCharacter) + ')';
    value = value.toLowerCase();

  } else {
    // Escape parent
    parent = utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(parent, self.escapeCharacter);
  }

  if(value !== null) {

    // Simple Key/Value attributes
    if(self.parameterized) {
      this.queryString += parent + ' ' + combinator + ' $' + this.paramCount;
      this.values.push(value);
      this.paramCount++;
    }
    else {
      if(_.isDate(value)) {
        value = value.getFullYear() + '-' +
          ('00' + (value.getMonth()+1)).slice(-2) + '-' +
          ('00' + value.getDate()).slice(-2) + ' ' +
          ('00' + value.getHours()).slice(-2) + ':' +
          ('00' + value.getMinutes()).slice(-2) + ':' +
          ('00' + value.getSeconds()).slice(-2);
      }

      if (_.isString(value)) {
        value = '"' + utils.escapeString(value) +'"';
      }

      this.queryString += parent + ' ' + combinator + ' ' + value;
    }
  }

  else {
    this.queryString += parent + ' IS NULL';
  }
};

/**
 * Prepare Criterion
 *
 * Processes comparators in a query.
 */

CriteriaProcessor.prototype.prepareCriterion = function prepareCriterion(key, value) {

  var self = this;
  var str;
  var comparator;
  var escapedDate = false;

  // Check value for a date type
  if(_.isDate(value)) {
    value = value.getFullYear() + '-' +
      ('00' + (value.getMonth()+1)).slice(-2) + '-' +
      ('00' + value.getDate()).slice(-2) + ' ' +
      ('00' + value.getHours()).slice(-2) + ':' +
      ('00' + value.getMinutes()).slice(-2) + ':' +
      ('00' + value.getSeconds()).slice(-2);

    value = '"' + value + '"';
    escapedDate = true;
  }

  switch(key) {

    case '<':
    case 'lessThan':

      if(this.parameterized) {
        this.values.push(value);
        str = '< ' + '$' + this.paramCount;
      }
      else {
        if(_.isString(value) && !escapedDate) {
          value = '"' + utils.escapeString(value) + '"';
        }
        str = '< ' + value;
      }

      break;

    case '<=':
    case 'lessThanOrEqual':

      if(this.parameterized) {
        this.values.push(value);
        str = '<= ' + '$' + this.paramCount;
      }
      else {
        if(_.isString(value) && !escapedDate) {
          value = '"' + utils.escapeString(value) + '"';
        }
        str = '<= ' + value;
      }

      break;

    case '>':
    case 'greaterThan':

      if(this.parameterized) {
        this.values.push(value);
        str = '> ' + '$' + this.paramCount;
      }
      else {
        if(_.isString(value) && !escapedDate) {
          value = '"' + utils.escapeString(value) + '"';
        }
        str = '> ' + value;
      }

      break;

    case '>=':
    case 'greaterThanOrEqual':

      if(this.parameterized) {
        this.values.push(value);
        str = '>= ' + '$' + this.paramCount;
      }
      else {
        if(_.isString(value) && !escapedDate) {
          value = '"' + utils.escapeString(value) + '"';
        }
        str = '>= ' + value;
      }

      break;

    case '!':
    case 'not':
      if(value === null) {
        str = 'IS NOT NULL';
      }
      else {
        // For array values, do a "NOT IN"
        if (Array.isArray(value)) {

          if(self.parameterized) {
            var params = [];

            this.values = this.values.concat(value);
            str = 'NOT IN (';

            value.forEach(function() {
              params.push('$' + self.paramCount++);
            });

            str += params.join(',') + ')';

            // Roll back one since we bump the count at the end
            this.paramCount--;
          }
          else {
            str = 'NOT IN (';
            value.forEach(function(val) {

              if(_.isString(val)) {
                val = '"' + utils.escapeString(val) + '"';
              }

              str += val + ',';
            });

            str = str.slice(0, -1) + ')';
          }
        }
        // Otherwise do a regular <>
        else {

          if(this.parameterized) {
            this.values.push(value);
            str = '<> ' + '$' + this.paramCount;
          }
          else {
            if(_.isString(value)) {
              value = '"' + utils.escapeString(value) + '"';
            }

            str = '<> ' + value;
          }
        }
      }

      break;

    case 'like':

      if(this.caseSensitive) {
        comparator = 'ILIKE';
      }
      else {
        comparator = 'LIKE';
      }

      if(this.parameterized) {
        this.values.push(value);
        str = comparator + ' ' + '$' + this.paramCount;
      }
      else {
        str = comparator + ' ' + utils.escapeName(value, '"');
      }

      break;

    case 'contains':

      if(this.caseSensitive) {
        comparator = 'ILIKE';
      }
      else {
        comparator = 'LIKE';
      }

      if(this.parameterized) {
        this.values.push('%' + value + '%');
        str = comparator + ' ' + '$' + this.paramCount;
      }
      else {
        str = comparator + ' ' + utils.escapeName('%' + value + '%', '"');
      }

      break;

    case 'startsWith':

      if(this.caseSensitive) {
        comparator = 'ILIKE';
      }
      else {
        comparator = 'LIKE';
      }

      if(this.parameterized) {
        this.values.push(value + '%');
        str = comparator + ' ' + '$' + this.paramCount;
      }
      else {
        str = comparator + ' ' + utils.escapeName(value + '%', '"');
      }

      break;

    case 'endsWith':

      if(this.caseSensitive) {
        comparator = 'ILIKE';
      }
      else {
        comparator = 'LIKE';
      }

      if(this.parameterized) {
        this.values.push('%' + value);
        str = comparator + ' ' + '$' + this.paramCount;
      }
      else {
        str = comparator + ' ' + utils.escapeName('%' + value, '"');
      }

      break;
  }

  // Bump paramCount
  this.paramCount++;

  // Add str to query
  this.queryString += str;
};

/**
 * Specify a `limit` condition
 */

CriteriaProcessor.prototype.limit = function(options) {
  // Some MySQL hackery here.  For details, see:
  // http://stackoverflow.com/questions/255517/mysql-offset-infinite-rows
  if(options === null || options === undefined) {
    this.queryString += ' LIMIT 184467440737095516 ';
  }
  else {
    this.queryString += ' LIMIT ' + options;
  }
};

/**
 * Specify a `skip` condition
 */

CriteriaProcessor.prototype.skip = function(options) {
  this.queryString += ' OFFSET ' + options;
};

/**
 * Specify a `sort` condition
 */

CriteriaProcessor.prototype.sort = function(options) {
  var self = this;

  this.queryString += ' ORDER BY ';

  Object.keys(options).forEach(function(key) {
    var direction = options[key] === 1 ? 'ASC' : 'DESC';
    self.queryString += utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(key, self.escapeCharacter) + ' ' + direction + ', ';
  });

  // Remove trailing comma
  this.queryString = this.queryString.slice(0, -2);
};

/**
 * Specify a `group by` condition
 */

CriteriaProcessor.prototype.group = function(options) {
  var self = this;

  this.queryString += ' GROUP BY ';

  // Normalize to array
  if(!Array.isArray(options)) options = [options];

  options.forEach(function(key) {
    self.queryString += utils.escapeName(self.currentTable, self.escapeCharacter) + '.' + utils.escapeName(key, self.escapeCharacter) + ', ';
  });

  // Remove trailing comma
  this.queryString = this.queryString.slice(0, -2);
};
