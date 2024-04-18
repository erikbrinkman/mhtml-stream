/**
 * class for storing headers parse from MHTML
 *
 * Tries to somewhat mimic the behavior of the fetch-api Headers object, with
 * some differences, notably that it does no validation.
 */
export interface MhtmlHeaders extends Iterable<[string, string]> {
  /**
   * add a key-value pair
   *
   * If key is already present it will be appended.
   */
  append(key: string, value: string): void;

  /**
   * iterate over all key-value pairs
   *
   * Multiple values for the same key will be joined in the order they were
   * added by `delimiter`.
   */
  entries(delimiter?: string): IterableIterator<[string, string]>;

  /**
   * iterate over all key-value pairs
   *
   * Multiple values for the same key will get iterated in the order they were
   * added.
   */
  entriesAll(): IterableIterator<[string, string]>;

  /**
   * get the value for a key
   *
   * If the key is missing, null will be returned, if multiple values for the
   * key are present, they will be joined be `delimiter`.
   */
  get(key: string, delimiter?: string): string | null;

  /** get all values for a key */
  getAll(key: string): string[];

  /** whether key has any values associated with it */
  has(key: string): boolean;

  /** all keys with at least one value */
  keys(): Iterable<string>;

  /**
   * iterate over all values
   *
   * If a key has multiple values they will be joined by `delimiter`.
   */
  values(delimiter?: string): IterableIterator<string>;

  /** iterate over all values added */
  valuesAll(): IterableIterator<string>;
}

export class Headers implements MhtmlHeaders {
  #raw = new Map<string, string[]>();

  [Symbol.iterator](): Iterator<[string, string]> {
    return this.entries();
  }

  append(key: string, value: string): void {
    const list = this.#raw.get(key);
    if (list === undefined) {
      this.#raw.set(key, [value]);
    } else {
      list.push(value);
    }
  }

  *entries(delim: string = ", "): IterableIterator<[string, string]> {
    for (const [key, values] of this.#raw.entries()) {
      yield [key, values.join(delim)];
    }
  }

  *entriesAll(): IterableIterator<[string, string]> {
    for (const [key, values] of this.#raw.entries()) {
      for (const val of values) {
        yield [key, val];
      }
    }
  }

  get(key: string, delim: string = ", "): string | null {
    const vals = this.#raw.get(key);
    if (vals === undefined) {
      return null;
    } else {
      return vals.join(delim);
    }
  }

  getAll(key: string): string[] {
    return this.#raw.get(key) ?? [];
  }

  has(key: string): boolean {
    return this.#raw.has(key);
  }

  keys(): Iterable<string> {
    return this.#raw.keys();
  }

  *values(delim: string = ", "): IterableIterator<string> {
    for (const vals of this.#raw.values()) {
      yield vals.join(delim);
    }
  }

  *valuesAll(): IterableIterator<string> {
    for (const vals of this.#raw.values()) {
      yield* vals;
    }
  }
}
