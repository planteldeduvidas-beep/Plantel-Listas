function criarGestaoMateriaisController(service) {
  async function responder(req,res,next,acao,status){try{res.status(status||200).json(await acao());}catch(erro){next(erro);}}
  return {
    listarPastas:function listarPastas(req,res,next){return responder(req,res,next,function executar(){return service.listarPastas(req.usuario);});},
    adicionar:function adicionar(req,res,next){return responder(req,res,next,function executar(){return service.adicionar(req.usuario,req.body,req.file);},201);},
    editar:function editar(req,res,next){return responder(req,res,next,function executar(){return service.editar(req.usuario,req.params.materialId,req.body);});},
    mover:function mover(req,res,next){return responder(req,res,next,function executar(){return service.mover(req.usuario,req.params.materialId,req.body);});},
    substituir:function substituir(req,res,next){return responder(req,res,next,function executar(){return service.substituir(req.usuario,req.params.materialId,req.body,req.file);});},
    enviarLixeira:function enviarLixeira(req,res,next){return responder(req,res,next,function executar(){return service.enviarLixeira(req.usuario,req.params.materialId,req.body);});},
    listarLixeira:function listarLixeira(req,res,next){return responder(req,res,next,function executar(){return service.listarLixeira(req.usuario);});},
    restaurar:function restaurar(req,res,next){return responder(req,res,next,function executar(){return service.restaurar(req.usuario,req.params.materialId,req.body);});},
    excluir:function excluir(req,res,next){return responder(req,res,next,function executar(){return service.excluirDefinitivamente(req.usuario,req.params.materialId,req.body);});}
  };
}
module.exports=criarGestaoMateriaisController;
