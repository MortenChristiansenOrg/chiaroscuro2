export class MockDataTransfer {
  data = new Map<string, string>();
  effectAllowed = "uninitialized";
  dropEffect = "none";
  setData(format: string, val: string) {
    this.data.set(format, val);
  }
  getData(format: string) {
    return this.data.get(format) ?? "";
  }
  setDragImage() {}
}
