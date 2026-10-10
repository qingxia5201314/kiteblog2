export function createImageService({ imageStore }) {
  return {
    listImages() {
      return imageStore.listImages();
    },
    saveImage(upload) {
      return imageStore.saveImage(upload);
    },
    getImage(id) {
      return imageStore.getImage(id);
    },
    removeImage(id) {
      return imageStore.removeImage(id);
    }
  };
}
