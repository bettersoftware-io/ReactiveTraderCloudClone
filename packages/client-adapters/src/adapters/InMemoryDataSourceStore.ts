import type { DataSource, DataSourceStore } from "./dataSource.js";

/** Test/in-process `DataSourceStore` (sibling of `InMemorySessionStore`). */
export class InMemoryDataSourceStore implements DataSourceStore {
  private value: DataSource | null = null;

  public read(): DataSource | null {
    return this.value;
  }

  public write(source: DataSource): void {
    this.value = source;
  }

  public clear(): void {
    this.value = null;
  }
}
