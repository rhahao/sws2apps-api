import Model from '../models/index.js';
import Storage from '../storages/index.js';
import Utility from '../utils/index.js';

class CongregationServices {
  private congregations: Map<string, Model.Congregation> = new Map();

  get count() {
    return this.congregations.size;
  }

  async loadIndex() {
    try {
      Utility.Logger.info('Indexing congregations from storage...');
      const folders = await Storage.listFolders('congregations/');

      this.congregations.clear();
      for (const folder of folders) {
        const congId = folder.split('/')[1];
        if (congId) {
          try {
            const cong = new Model.Congregation(congId);
            this.congregations.set(congId, cong);
          } catch (err) {
            Utility.Logger.error(
              `Failed to index congregation ${congId}:`,
              err
            );
          }
        }
      }

      Utility.Logger.info(
        `Successfully indexed ${this.congregations.size} congregations.`
      );
    } catch (error) {
      Utility.Logger.error('Failed to load congregation index:', error);
    }
  }

  getCongregations() {
    return Array.from(this.congregations.values());
  }

  hasCongregation(id: string) {
    return this.congregations.has(id);
  }

  findById(id: string) {
    return this.congregations.get(id);
  }
}

export default new CongregationServices();
