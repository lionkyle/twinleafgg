import { StateUtils } from '../../game';
import { CardType, EnergyType } from '../../game/store/card/card-types';
import { EnergyCard } from '../../game/store/card/energy-card';
import { DealDamageEffect } from '../../game/store/effects/attack-effects';
import { Effect } from '../../game/store/effects/effect';

import { State } from '../../game/store/state/state';
import { StoreLike } from '../../game/store/store-like';

export class PowerfulColorlessEnergy extends EnergyCard {

  public provides: CardType[] = [CardType.COLORLESS];

  public energyType = EnergyType.SPECIAL;

  public set: string = 'DAA';

  public regulationMark = 'D';

  public cardImage: string = 'assets/cardback.png';

  public setNumber: string = '176';

  public name = 'Powerful Colorless Energy';

  public fullName = 'Powerful Colorless Energy DAA';

  public text =
    'As long as this card is attached to a Pokémon, it provides [C] Energy.' +
    '' +
    'The attacks of the [C] Pokémon this card is attached to do 20 more damage to your opponent\'s Active Pokémon (before applying Weakness and Resistance).';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {
    if (effect instanceof DealDamageEffect && effect.source.cards.includes(this)) {
      const opponent = StateUtils.getOpponent(state, effect.player);
      const attackingPokemon = effect.source.getPokemonCard();
      const attack = effect.attack;
      if (attack && attack.damage > 0 && effect.target === opponent.active && attackingPokemon?.cardType === CardType.COLORLESS) {
        effect.damage += 20;
      }
    }

    return state;
  }

}
