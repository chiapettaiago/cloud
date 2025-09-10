// Arquivo de exemplo JavaScript para teste
console.log("=== Chiapetta Cloud - Teste JavaScript ===");
console.log("Olá! Este é um script JavaScript de teste.");
console.log("");

const data = new Date();
console.log(`Data/Hora: ${data.toLocaleString('pt-BR')}`);
console.log(`Versão Node.js: ${process.version}`);
console.log(`Plataforma: ${process.platform}`);
console.log("");

// Teste de operações
const numeros = [1, 2, 3, 4, 5];
const soma = numeros.reduce((acc, num) => acc + num, 0);
console.log(`Soma de [${numeros.join(', ')}]: ${soma}`);
console.log("");

// Teste de loop
console.log("Contando de 1 a 5:");
for (let i = 1; i <= 5; i++) {
    console.log(`  ${i}`);
}
console.log("");

// Teste de função
function saudar(nome) {
    return `Olá, ${nome}! Bem-vindo ao Chiapetta Cloud!`;
}

console.log(saudar("Usuário"));
console.log("");

console.log("Script executado com sucesso! 🎉");
