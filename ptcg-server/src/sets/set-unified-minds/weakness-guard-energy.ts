import { StateUtils } from '../../game';
import { CardType, EnergyType } from '../../game/store/card/card-types';
import { EnergyCard } from '../../game/store/card/energy-card';
import { CheckPokemonStatsEffect } from '../../game/store/effects/check-effects';
import { Effect } from '../../game/store/effects/effect';
import { IS_SPECIAL_ENERGY_BLOCKED } from '../../game/store/prefabs/prefabs';

import { State } from '../../game/store/state/state';
import { StoreLike } from '../../game/store/store-like';

export class WeaknessGuardEnergy extends EnergyCard {

  public provides: CardType[] = [CardType.COLORLESS];

  public energyType = EnergyType.SPECIAL;

  public set: string = 'UNM';

  public cardImage: string = 'assets/cardback.png';

  public setNumber: string = '213';

  public name = 'Weakness Guard Energy';

  public fullName = 'Weakness Guard Energy UNM';

  public text =
    'This card provides [C] Energy.' +
    '\n\n' +
    'The Pokémon this card is attached to has no Weakness.';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {
    if (effect instanceof CheckPokemonStatsEffect && effect.target.cards.includes(this)) {
      const player = StateUtils.findOwner(state, effect.target);
      const opponent = StateUtils.getOpponent(state, player);
      if (!IS_SPECIAL_ENERGY_BLOCKED(store, state, opponent, this, effect.target)) {
        const target = effect.target.getPokemonCard();
        if (target) {
          effect.weakness = [];
        }
      }
    }
    return state;
  }
}