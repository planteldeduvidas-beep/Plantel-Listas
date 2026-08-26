function impedirCachePrivado(req, res, next) {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
  next();
}

module.exports = impedirCachePrivado;

