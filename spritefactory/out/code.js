class Conta {
    constructor() {
        this.saldo = 0;
    }

    rende() {
        throw new Error('Method must be implemented');
    }
}

class ContaCorrente extends Conta {
    rende() {
        this.saldo += this.saldo * 0.1;
    }
}

class ContaPoupanca extends Conta {
    rende() {
        this.saldo += this.saldo * 0.2;
    }
}