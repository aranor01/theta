Object({
    toPascalCase: function(str) {
        str = str.trim()
        if (str.length === 0) return str
        return str.split(/[\s_]+/).map((word) => word[0].toUpperCase() + word.substring(1)).join('')
    },
    camelCaseToSnakeCase: function(str) {
        return str.replace(/([a-zA-Z])(?=[A-Z])/g,'$1_').toLowerCase()
    }
})
