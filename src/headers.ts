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
  // keyed by lowercased name; the original name casing (first seen) is
  // preserved for iteration while lookups are case-insensitive, per RFC 5322
  #raw = new Map<string, { key: string; values: string[] }>();

  [Symbol.iterator](): Iterator<[string, string]> {
    return this.entries();
  }

  append(key: string, value: string): void {
    const entry = this.#raw.get(key.toLowerCase());
    if (entry === undefined) {
      this.#raw.set(key.toLowerCase(), { key, values: [value] });
    } else {
      entry.values.push(value);
    }
  }

  *entries(delim: string = ", "): IterableIterator<[string, string]> {
    for (const { key, values } of this.#raw.values()) {
      yield [key, values.join(delim)];
    }
  }

  *entriesAll(): IterableIterator<[string, string]> {
    for (const { key, values } of this.#raw.values()) {
      for (const val of values) {
        yield [key, val];
      }
    }
  }

  get(key: string, delim: string = ", "): string | null {
    const entry = this.#raw.get(key.toLowerCase());
    if (entry === undefined) {
      return null;
    } else {
      return entry.values.join(delim);
    }
  }

  getAll(key: string): string[] {
    return this.#raw.get(key.toLowerCase())?.values ?? [];
  }

  has(key: string): boolean {
    return this.#raw.has(key.toLowerCase());
  }

  *keys(): IterableIterator<string> {
    for (const { key } of this.#raw.values()) {
      yield key;
    }
  }

  *values(delim: string = ", "): IterableIterator<string> {
    for (const { values } of this.#raw.values()) {
      yield values.join(delim);
    }
  }

  *valuesAll(): IterableIterator<string> {
    for (const { values } of this.#raw.values()) {
      yield* values;
    }
  }
}
