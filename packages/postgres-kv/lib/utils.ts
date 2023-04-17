export function safeSql(text: string): string {
  return text.replace(/(\/|\\|"|'|%| |:|-|`|\.|\||\|\|;|&|\[|\]|\{|\}|\(|\)|\n)/g, "_");
}

export function waiting(delay: number) {
  return new Promise((res) => setTimeout(res, delay));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function deepMerge(...args: any[]) {
  const result = args[0];
  const stack = Array.prototype.slice.call(args, 1);
  let item;
  let key;
  while (stack.length) {
    item = stack.shift();
    for (key in item) {
      // eslint-disable-next-line no-prototype-builtins
      if (item.hasOwnProperty(key)) {
        if (
          typeof result[key] === "object" &&
          result[key] &&
          Object.prototype.toString.call(result[key]) !== "[object Array]"
        ) {
          if (typeof item[key] === "object" && item[key] !== null) {
            result[key] = deepMerge({}, result[key], item[key]);
          } else {
            result[key] = item[key];
          }
        } else {
          result[key] = item[key];
        }
      }
    }
  }
  return result;
}
