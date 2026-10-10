const UTF8_AS_LATIN1_MARKERS = /[\u0080-\u009f]|[ÂÃÄÅÆÇÈÉÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/;

export function recoverUtf8Filename(value) {
  const text = String(value || '');
  if (!text || !UTF8_AS_LATIN1_MARKERS.test(text)) return text;

  const decoded = Buffer.from(text, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? text : decoded;
}
