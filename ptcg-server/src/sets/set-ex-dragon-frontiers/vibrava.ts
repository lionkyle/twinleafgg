import { PokemonCard } from '../../game/store/card/pokemon-card';
import { Stage, CardType, CardTag } from '../../game/store/card/card-types';
import { StoreLike, State } from '../../game';
import { Effect } from '../../game/store/effects/effect';
import { WAS_ATTACK_USED } from '../../game/store/prefabs/prefabs';
import { YOUR_OPPPONENTS_ACTIVE_POKEMON_IS_NOW_CONFUSED } from '../../game/store/prefabs/attack-effects';

export class Vibrava extends PokemonCard {
  public tags = [CardTag.DELTA_SPECIES];
  public stage: Stage = Stage.STAGE_1;
  public evolvesFrom = 'Trapinch';
  public cardType: CardType = P;
  public hp: number = 70;
  public retreat = [C];

  public attacks = [{
    name: 'Bite',
    cost: [C],
    damage: 20,
    text: ''
  },
  {
    name: 'Sonic Noise',
    cost: [P, C],
    damage: 30,
    text: 'If the Defending Pokémon is Pokémon-ex, that Pokémon is now Confused.'
  }];

  public set: string = 'DF';
  public cardImage: string = 'assets/cardback.png';
  public setNumber: string = '42';
  public name: string = 'Vibrava';
  public fullName: string = 'Vibrava DF 42';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {

    if (WAS_ATTACK_USED(effect, 1, this)) {
      if (effect.opponent.active.getPokemonCard()?.tags.includes(CardTag.POKEMON_ex)) {
        YOUR_OPPPONENTS_ACTIVE_POKEMON_IS_NOW_CONFUSED(store, state, effect);
      }
    }

    return state;
  }
}