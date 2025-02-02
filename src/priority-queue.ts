type Comparator<T> = (a: T, b: T) => number;

export class PriorityQueue<T> {
  #heap: T[] = [];
  #compare: Comparator<T>;

  constructor(compare: Comparator<T>) {
    this.#compare = compare;
  }

  enqueue(item: T): void {
    this.#heap.push(item);
    this.#bubbleUp(this.#heap.length - 1);
  }

  dequeue(): T | undefined {
    const root = this.#heap[0];
    const last = this.#heap.pop();
    if (this.#heap.length > 0 && last !== undefined) {
      this.#heap[0] = last;
      this.#sinkDown(0);
    }
    return root;
  }

  get size(): number {
    return this.#heap.length;
  }

  #bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.#compare(this.#heap[index], this.#heap[parent]) >= 0) break;
      [this.#heap[parent], this.#heap[index]] = [
        this.#heap[index],
        this.#heap[parent]
      ];
      index = parent;
    }
  }

  #sinkDown(index: number): void {
    const length = this.#heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (
        left < length &&
        this.#compare(this.#heap[left], this.#heap[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < length &&
        this.#compare(this.#heap[right], this.#heap[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.#heap[index], this.#heap[smallest]] = [
        this.#heap[smallest],
        this.#heap[index]
      ];
      index = smallest;
    }
  }
}
