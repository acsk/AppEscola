export type CEPAddress = {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
};

export async function fetchAddressByCEP(cep: string): Promise<CEPAddress> {
  const cleanCep = cep.replace(/\D/g, "");
  if (cleanCep.length !== 8) {
    throw new Error("CEP inválido");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  if (!response.ok) {
    throw new Error("Falha ao consultar CEP");
  }

  const data = await response.json();
  if (data?.erro) {
    throw new Error("CEP não encontrado");
  }

  return {
    cep: data.cep ?? "",
    street: data.logradouro ?? "",
    neighborhood: data.bairro ?? "",
    city: data.localidade ?? "",
    state: data.uf ?? "",
  };
}
