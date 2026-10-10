export function createFileService({ fileStore }) {
  return {
    listFolder(folderId) {
      return fileStore.listFolder(folderId);
    },
    saveFile(upload) {
      return fileStore.saveFile(upload);
    },
    createAccessLink(id) {
      return fileStore.createAccessLink(id);
    },
    createPreviewLink(id) {
      return fileStore.createAccessLink(id);
    },
    getFileForToken(id, token) {
      return fileStore.getFileForToken(id, token);
    },
    getPublicMedia(id, extension) {
      return fileStore.getPublicMedia(id, extension);
    },
    removeFile(id) {
      return fileStore.removeFile(id);
    }
  };
}
