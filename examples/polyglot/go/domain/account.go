// [LAYER: DOMAIN]
// Pure Domain contract and entity in Go (0% I/O).
package domain

import "errors"

type Account struct {
	ID           string
	BalanceCents int64
}

func (a *Account) Withdraw(amountCents int64) error {
	if amountCents <= 0 {
		return errors.New("withdrawal amount must be positive")
	}
	if a.BalanceCents < amountCents {
		return errors.New("insufficient funds")
	}
	a.BalanceCents -= amountCents
	return nil
}

type IAccountRepository interface {
	FindByID(id string) (*Account, error)
	Save(account *Account) error
}

