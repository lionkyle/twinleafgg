import { PokemonCard } from '../../game/store/card/pokemon-card';
import { Stage, CardType } from '../../game/store/card/card-types';
import { StoreLike, State } from '../../game';
import { AttackEffect } from '../../game/store/effects/game-effects';

export class Gastly extends PokemonCard {

  public regulationMark = 'G';

  public stage: Stage = Stage.BASIC;

  public cardType: CardType = CardType.DARK;

  public hp: number = 50;

  public weakness = [{ type: CardType.FIGHTING }];

  public retreat = [ CardType.COLORLESS ];

  public attacks = [
    {
      name: 'Allure',
      cost: [CardType.COLORLESS],
      damage: 0,
      text: 'Draw 1 card.'
    },
    {
      name: 'Will-O-Wisp',
      cost: [CardType.DARK, CardType.COLORLESS],
      damage: 20,
      text: ''
    }
  ];

  public set: string = 'PAF';

  public cardImage: string = 'assets/cardback.png';

  public setNumber: string = '55';

  public name: string = 'Gastly';

  public fullName: string = 'Gastly PAF';

  public reduceEffect(store: StoreLike, state: State, effect: AttackEffect): State {

    if (effect instanceof AttackEffect && effect.attack === this.attacks[0]) {

      const player = effect.player;

      player.deck.moveTo(player.hand, 1);

      return state;
    }
    return state;
  }
}