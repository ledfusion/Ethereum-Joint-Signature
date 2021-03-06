var JointSignature = artifacts.require("./JointSignature.sol");

var Web3 = require('web3');
var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

contract('JointSignature', function (accounts) {
  var instance, gasPrice;
  const manager = accounts[0];
  const shareholders = accounts.slice(1, 4);
  const receivers = accounts.slice(4, 9);
  const nonManagers = accounts.slice(1);

  it("should have deployed an instance", function () {
    const minAmount = web3.toWei(3, 'ether');

    return JointSignature.deployed()
      .then(function (inst) {
        assert(inst, "is not deployed")
        instance = inst;

        // has at least minAmount?
        if (web3.eth.getBalance(instance.address).cmp(minAmount) == 1) return;

        return instance.sendTransaction({ from: accounts[0], value: minAmount })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")
            assert(web3.eth.getBalance(instance.address).cmp(minAmount) >= 0, "Insufficient amount available in the contract (for testing)")

            gasPrice = web3.eth.getTransaction(result.tx).gasPrice;
          })
      })
      .catch(function (error) {
        assert(false, "failed loading the instance: " + error.message);
      });
  });

  it("should let the manager register a payment", function () {
    return instance.getDebt.call(receivers[0], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "did not properly set the payment amount");

        return instance.createPayment(web3.toWei(1, 'ether'), receivers[0], { from: manager });
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        return instance.getDebt.call(receivers[0], { from: shareholders[0] });
      })
      .then(debt => {
        assert(debt == web3.toWei(1, 'ether'), "did not properly set the payment amount");
      })
      .catch(function (err) {
        assert(false, "failed registering a payment: " + err.message);
      })
  });

  it("should increase the amount for an already existing payment, and reset the existing approvals", function () {
    return instance.createPayment(web3.toWei(1, 'ether'), receivers[0], { from: manager })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        return instance.getDebt.call(receivers[0], { from: shareholders[0] });
      })
      .then(debt => {
        assert(debt == web3.toWei(2, 'ether'), "did not properly set the payment amount");
      })
      .catch(function (err) {
        assert(false, "failed registering a payment: " + err.message);
      })
  });

  it("withdrawal should have no effect with non-approved payments", function () {
    var receiverInitialBalance = web3.eth.getBalance(receivers[1]);
    return instance.withdraw({ from: receivers[1] })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        const txCost = gasPrice.mul(result.receipt.gasUsed);
        assert(web3.eth.getBalance(receivers[1]).equals(receiverInitialBalance.minus(txCost)), "balance should be the same (minus gas)");
      })
      .catch(err => {
        assert(false, "withdrawal failed: " + err.message);
      })
  });

  it("a payment of less than 0.5 ether should be approved immediately", function () {
    var receiverInitialBalance = web3.eth.getBalance(receivers[1]);
    const smallAmount = web3.toWei(0.1, 'ether');

    return instance.getDebt.call(receivers[1], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "initial debt should be zero");

        return instance.createPayment(smallAmount, receivers[1], { from: manager })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        return instance.withdraw({ from: receivers[1] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        const txCost = gasPrice.mul(result.receipt.gasUsed);
        assert(web3.eth.getBalance(receivers[1]).equals(receiverInitialBalance.plus(smallAmount).minus(txCost)), "balance should have increased by 0.1 ether (minus gas)");
      })
      .catch(function (err) {
        assert(false, "failed registering a payment: " + err.message);
      })
  });

  it("subsequent payments of less than 0.5 ether within a month should require approval", function () {
    var receiverInitialBalance = web3.eth.getBalance(receivers[1])

    return instance.getDebt.call(receivers[1], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "initial debt should still be zero");

        return instance.createPayment(web3.toWei(0.1, 'ether'), receivers[1], { from: manager })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        return instance.withdraw({ from: receivers[1] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        const txCost = gasPrice.mul(result.receipt.gasUsed);
        assert(web3.eth.getBalance(receivers[1]).equals(receiverInitialBalance.minus(txCost)), "receiver should have the same balance (minus gas)");
      })
      .catch(function (err) {
        assert(false, "failed registering a payment: " + err.message);
      })
  });

  it("should not let anyone else to register a payment", function () {
    const attemptExtraValue = 1000000000000;

    return instance.createPayment(web3.toWei(0.1, 'ether'), receivers[1], { from: shareholders[0] })
      .then(() => {
        assert(false, "should have failed, but didn't");
      })
      .catch(function (error) {
        assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
      })
      .then(() => {
        return instance.createPayment(web3.toWei(0.1, 'ether'), receivers[1], { from: receivers[0] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(false, "should have failed, but didn't");
          })
          .catch(function (error) {
            assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
          })
      });
  });

  it("should allow shareholders to appove a payment", function () {
    const midAmount = web3.toWei(0.7, 'ether');
    var receiverInitialBalance = web3.eth.getBalance(receivers[2])

    return instance.createPayment(midAmount, receivers[2], { from: manager })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance), "Should have the exact same balance as before");

        // shareholder 0 says OK
        return instance.approvePayment(receivers[2], { from: shareholders[0] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance), "Should have the exact same balance as before");

            return instance.getDebt.call(receivers[2], { from: shareholders[0] })
          })
          .then(debt => {
            assert(debt.equals(midAmount), "did not properly set the payment amount");

            // shareholder 1 says OK
            return instance.approvePayment(receivers[2], { from: shareholders[1] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")

            return instance.getDebt.call(receivers[2], { from: shareholders[0] })
          })
          .then(debt => {
            assert(debt.equals(0), "should have no pending debt now");

            // already majority => check paid
            return instance.withdraw({ from: receivers[2] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")

            const txCost = gasPrice.mul(result.receipt.gasUsed);
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance.plus(midAmount).minus(txCost)), "balance should have increased by 0.7 ether (minus gas)");
          })
      })
      .catch(error => {
        assert(false, "failed registering a payment: " + error.message);
      });
  });

  it("should allow shareholders to reject a payment", function () {
    const amount = web3.toWei(0.7, 'ether');
    var receiverInitialBalance = web3.eth.getBalance(receivers[2]);

    return instance.getDebt.call(receivers[2], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "should have no debt");

        return instance.createPayment(amount, receivers[2], { from: manager })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance), "Should have the exact same balance as before");

        // shareholder 0 says OK
        return instance.approvePayment(receivers[2], { from: shareholders[0] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance), "Should have the exact same balance as before");

            return instance.getDebt.call(receivers[2], { from: shareholders[0] })
          })
          .then(debt => {
            assert(debt.equals(amount), "did not properly set the payment amount");

            return instance.withdraw({ from: receivers[2] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")

            const txCost = gasPrice.mul(result.receipt.gasUsed);
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance.minus(txCost)), "receiver should have the same balance (minus gas)");
            receiverInitialBalance = web3.eth.getBalance(receivers[2]); // refresh

            // shareholder 1 says KO
            return instance.rejectPayment(receivers[2], { from: shareholders[1] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance), "Should have the exact same balance as before");

            return instance.getDebt.call(receivers[2], { from: shareholders[0] })
          })
          .then(debt => {
            assert(debt.equals(amount), "did not properly set the payment amount");

            return instance.withdraw({ from: receivers[2] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")

            const txCost = gasPrice.mul(result.receipt.gasUsed);
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance.minus(txCost)), "receiver should have the same balance (minus gas)");
            receiverInitialBalance = web3.eth.getBalance(receivers[2]); // refresh

            // shareholder 2 says KO
            return instance.rejectPayment(receivers[2], { from: shareholders[2] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            // already majority => check nothing paid
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance), "Should have the exact same balance as before");

            return instance.getDebt.call(receivers[2], { from: shareholders[0] })
          })
          .then(debt => {
            assert(debt.equals(0), "should have no debt");

            return instance.withdraw({ from: receivers[2] })
          })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(result && result.tx && result.receipt, "transaction should have succeeded")

            const txCost = gasPrice.mul(result.receipt.gasUsed);
            assert(web3.eth.getBalance(receivers[2]).equals(receiverInitialBalance.minus(txCost)), "receiver should have the same balance (minus gas)");
            receiverInitialBalance = web3.eth.getBalance(receivers[2]); // refresh
          })
      })
      .catch(error => {
        assert(false, "failed registering a payment: " + error.message);
      });
  });

  it("should not allow non-shareholders to appove a payment", function () {
    return instance.createPayment(web3.toWei(0.7, 'ether'), receivers[2], { from: manager })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        return instance.approvePayment(receivers[2], { from: manager })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(false, "should have failed, but didn't");
          })
          .catch(function (error) {
            assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
          })
      })
      .then(() => {
        return instance.approvePayment(receivers[2], { from: receivers[0] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(false, "should have failed, but didn't");
          })
          .catch(function (error) {
            assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
          })
      })
  });

  it("should not allow non-shareholders to reject a payment", function () {
    return instance.createPayment(web3.toWei(0.7, 'ether'), receivers[2], { from: manager })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        return instance.rejectPayment(receivers[2], { from: manager })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(false, "should have failed, but didn't");
          })
          .catch(function (error) {
            assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
          })
      })
      .then(() => {
        return instance.rejectPayment(receivers[2], { from: receivers[0] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(false, "should have failed, but didn't");
          })
          .catch(function (error) {
            assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
          })
      })
  });

  // it("should fulfill a payment whenever more than 50% of shareholders accept it", function() {
  //   // Redundant => already tested above
  // });

  // it("should not fulfill a payment when less than 50% of shareholders have accepted it", function() {
  //   // Redundant => already tested above
  // });

  it("should not let the manager execute a payment if votes for/against are equal", function () {
    var receiverInitialBalance = web3.eth.getBalance(receivers[3]);
    const amount = web3.toWei(0.8, 'ether');

    return instance.getDebt.call(receivers[3], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "initial debt should be zero");

        return instance.createPayment(amount, receivers[3], { from: manager })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

        return instance.executePayment(receivers[3], { from: manager })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

            return web3.eth.getBalance(receivers[3])
          })
      })
      .then(balance => {
        assert(balance.equals(receiverInitialBalance), "Receiver should still have the same balance");

        // wait 5.5s
        return new Promise(resolve => setTimeout(resolve, 5500));
      })
      .then(() => {
        return web3.eth.getBalance(receivers[3])
      })
      .then(balance => {
        assert(balance.equals(receiverInitialBalance), "Receiver should still have the same balance");

        return instance.executePayment(receivers[3], { from: manager });
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

        return instance.withdraw({ from: receivers[3] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        const txCost = gasPrice.mul(result.receipt.gasUsed);
        assert(web3.eth.getBalance(receivers[3]).equals(receiverInitialBalance.minus(txCost)), "receiver should still have the same balance (minus gas)");
        receiverInitialBalance = web3.eth.getBalance(receivers[3]); // refresh
      })
      .catch(function (err) {
        assert(false, "failed executing the payment: " + err.message);
      })
  });

  it("should allow the manager to execute a payment after a week if simple majority approved it", function () {
    var receiverInitialBalance = web3.eth.getBalance(receivers[4]);
    const amount = web3.toWei(0.8, 'ether');

    return instance.getDebt.call(receivers[4], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "initial debt should be zero");

        return instance.createPayment(amount, receivers[4], { from: manager })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        return instance.approvePayment(receivers[4], { from: shareholders[0] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        return instance.executePayment(receivers[4], { from: manager })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

            return web3.eth.getBalance(receivers[4])
          })
      })
      .then(balance => {
        assert(balance.equals(receiverInitialBalance), "Receiver should still have the same balance");

        // wait 5.5s
        return new Promise(resolve => setTimeout(resolve, 5500));
      })
      .then(() => {
        return web3.eth.getBalance(receivers[4])
      })
      .then(balance => {
        assert(balance.equals(receiverInitialBalance), "Receiver should still have the same balance");

        return instance.executePayment(receivers[4], { from: manager });
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

        return instance.withdraw({ from: receivers[4] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        const txCost = gasPrice.mul(result.receipt.gasUsed);
        assert(web3.eth.getBalance(receivers[4]).equals(receiverInitialBalance.plus(amount).minus(txCost)), "receiver should have +0.8 ether (minus gas)");
        receiverInitialBalance = web3.eth.getBalance(receivers[4]); // refresh

        return instance.getDebt.call(receivers[4], { from: shareholders[0] })
      })
      .then(debt => {
        assert(debt.equals(0), "did not clean the debt");
      })
      .catch(function (err) {
        assert(false, "failed executing the payment: " + err.message);
      })
  });

  it("should not allow the manager to execute a payment after a week if simple minority rejected it", function () {
    var receiverInitialBalance = web3.eth.getBalance(receivers[4]);
    const amount = web3.toWei(0.8, 'ether');

    return instance.getDebt.call(receivers[4], { from: shareholders[0] })
      .then(debt => {
        assert(debt.equals(0), "initial debt should be zero");

        return instance.createPayment(amount, receivers[4], { from: manager })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        return instance.rejectPayment(receivers[4], { from: shareholders[0] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        return instance.executePayment(receivers[4], { from: manager })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

            return web3.eth.getBalance(receivers[4])
          })
      })
      .then(balance => {
        assert(balance.equals(receiverInitialBalance), "Receiver should still have the same balance");

        // wait 5.5s
        return new Promise(resolve => setTimeout(resolve, 5500));
      })
      .then(() => {
        return web3.eth.getBalance(receivers[4])
      })
      .then(balance => {
        assert(balance.equals(receiverInitialBalance), "Receiver should still have the same balance");

        return instance.executePayment(receivers[4], { from: manager });
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);

        return instance.withdraw({ from: receivers[4] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(result && result.tx && result.receipt, "transaction should have succeeded")

        const txCost = gasPrice.mul(result.receipt.gasUsed);
        assert(web3.eth.getBalance(receivers[4]).equals(receiverInitialBalance.minus(txCost)), "receiver should still have the same balance (minus gas)");
        receiverInitialBalance = web3.eth.getBalance(receivers[4]); // refresh

        return instance.getDebt.call(receivers[4], { from: shareholders[0] })
      })
      .then(debt => {
        assert(debt.equals(amount), "should not clean the debt");
      })
      .catch(function (err) {
        assert(false, "failed executing the payment: " + err.message);
      })
  });

  it("should have the right manager and only allow the manager to thange this role", function () {
    var proms = nonManagers.map(acc => {
      return instance.setManager(accounts[0], { from: acc })
        .then(result => {
          assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
          assert(false, "setManager was supposed to reject a non-manager but didn't.");
        })
        .catch(error => {
          assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
        })
    });

    return Promise.all(proms)
      .then(() => instance.setManager(accounts[1], { from: manager }))
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
      })
      .catch(error => {
        assert(false, error.toString());
      })
      .then(() => instance.setManager(accounts[1], { from: manager }))
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(false, "setManager was supposed to reject the original manager but didn't.");
      }).catch(error => {
        assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
      })
      .then(() => instance.setManager(accounts[0], { from: accounts[1] }));
  });

  it("should only allow the owner to kill the contract", function () {
    var tempDebt;
    const checkAddress = receivers[0];
    const contractInitialBalance = web3.eth.getBalance(instance.address);
    const managerInitialBalance = web3.eth.getBalance(manager);

    return instance.getDebt.call(checkAddress, { from: shareholders[0] })
      .then(debt => {
        tempDebt = debt;

        return instance.kill({ from: shareholders[0] })
      })
      .then(result => {
        assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
        assert(web3.eth.getBalance(instance.address).equals(contractInitialBalance), "contract balance should not have changed");
        assert(web3.eth.getBalance(manager).equals(managerInitialBalance), "manager's balance should not have changed");

        return instance.getDebt.call(checkAddress, { from: shareholders[0] })
          .then(debt => {
            assert(debt.equals(tempDebt), "the contract should still be alive");
          })
      })
      .then(() => {
        return instance.kill({ from: shareholders[1] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(web3.eth.getBalance(instance.address).equals(contractInitialBalance), "contract balance should not have changed");
            assert(web3.eth.getBalance(manager).equals(managerInitialBalance), "manager's balance should not have changed");

            return instance.getDebt.call(checkAddress, { from: shareholders[0] })
              .then(debt => {
                assert(debt.equals(tempDebt), "the contract should still be alive");
              })
          })
      })
      .then(() => {
        return instance.kill({ from: shareholders[2] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(web3.eth.getBalance(instance.address).equals(contractInitialBalance), "contract balance should not have changed");
            assert(web3.eth.getBalance(manager).equals(managerInitialBalance), "manager's balance should not have changed");

            return instance.getDebt.call(checkAddress, { from: shareholders[0] })
              .then(debt => {
                assert(debt.equals(tempDebt), "the contract should still be alive");
              })
          })
      })
      .then(() => {
        return instance.kill({ from: receivers[1] })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(web3.eth.getBalance(instance.address).equals(contractInitialBalance), "contract balance should not have changed");
            assert(web3.eth.getBalance(manager).equals(managerInitialBalance), "manager's balance should not have changed");

            return instance.getDebt.call(checkAddress, { from: shareholders[0] })
              .then(debt => {
                assert(debt.equals(tempDebt), "the contract should still be alive");
              })
          })
      })
      .then(() => {
        return instance.kill({ from: manager })
          .then(result => {
            assert(result.receipt.gasUsed < 300000, "Uses so much gas:", result.receipt.gasUsed, result.tx);
            assert(web3.eth.getBalance(instance.address).equals(0), "contract balance should be 0");

            const txCost = gasPrice.mul(result.receipt.gasUsed);
            assert(web3.eth.getBalance(manager).equals(managerInitialBalance.plus(contractInitialBalance).minus(txCost)), "manager should still have the same balance (minus gas)");

            return instance.getDebt.call(checkAddress, { from: shareholders[0] })
              .then(result => {
                assert(result.equals(0), "the contract should have died");
              })
              .catch(function (error) {
                assert(error.toString().indexOf("invalid opcode") > 0, error.toString());
              })
          })
      })
  });

});
