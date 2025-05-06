import { PokemonCard } from '../../game/store/card/pokemon-card';
import { Stage, CardType, CardTag } from '../../game/store/card/card-types';
import { GameError, GameMessage, PokemonCardList, Power, PowerType, State, StoreLike } from '../../game';
import { Effect, PowerEffect } from '../../game/store/effects/game-effects';
import { PikachuVUNIONTopLeft } from './pikachu-v-union-tl';
import { PikachuVUNIONBottomLeft } from './pikachu-v-union-bl';
import { PikachuVUNIONBottomRight } from './pikachu-v-union-br';

export class PikachuVUNIONTopRight extends PokemonCard {
  public stage: Stage = Stage.VUNION;
  public tags = [CardTag.POKEMON_VUNION];
  public cardType: CardType = L;
  public hp: number = 300;
  public weakness = [{ type: F }];
  public retreat = [C, C];

  public powers: Power[] = [
    {
      name: 'Pikachu V-UNION Assembly',
      text: 'Once per game during your turn, combine 4 different Pikachu V-UNION from your discard pile and put them onto your bench.',
      useFromDiscard: true,
      exemptFromAbilityLock: true,
      powerType: PowerType.VUNION_ASSEMBLY,
    }
  ];

  public attacks = [
    {
      name: 'Shocking Shock',
      cost: [L, C],
      damage: 120,
      text: 'Flip a coin. If heads, your opponent\'s Active Pokémon is now Paralyzed.'
    }
  ];

  public set: string = 'SWSH';
  public regulationMark = 'E';
  public cardImage: string = 'assets/cardback.png';
  public setNumber: string = '140';
  public name: string = 'Pikachu V-UNION';
  public fullName: string = 'Pikachu V-UNION (Top Right) SWSH';

  public reduceEffect(store: StoreLike, state: State, effect: Effect): State {
    // assemblin the v-union
    if (effect instanceof PowerEffect && effect.power === this.powers[0]) {
      const player = effect.player;
      const slots: PokemonCardList[] = player.bench.filter(b => b.cards.length === 0);

      if (player.assembledVUNIONs.includes(this.name)) {
        throw new GameError(GameMessage.CANNOT_PLAY_THIS_CARD);
      }
      if (slots.length === 0) {
        throw new GameError(GameMessage.CANNOT_USE_POWER);
      }

      let topLeftPiece = false;
      let topRightPiece = false;
      let bottomLeftPiece = false;
      let bottomRightPiece = false;
      player.discard.cards.forEach(card => {
        if (card instanceof PikachuVUNIONTopLeft) { topLeftPiece = true; }
        if (card instanceof PikachuVUNIONTopRight) { topRightPiece = true; }
        if (card instanceof PikachuVUNIONBottomLeft) { bottomLeftPiece = true; }
        if (card instanceof PikachuVUNIONBottomRight) { bottomRightPiece = true; }
      });

      if (topLeftPiece && topRightPiece && bottomLeftPiece && bottomRightPiece) {
        if (slots.length > 0) {
          player.discard.cards.forEach(card => { if (card instanceof PikachuVUNIONTopRight) { player.discard.moveCardTo(card, slots[0]); } });
          player.discard.cards.forEach(card => { if (card instanceof PikachuVUNIONBottomLeft) { player.discard.moveCardTo(card, slots[0]); } });
          player.discard.cards.forEach(card => { if (card instanceof PikachuVUNIONBottomRight) { player.discard.moveCardTo(card, slots[0]); } });
          // gotta make sure the actual mon ends up on top
          player.discard.cards.forEach(card => { if (card instanceof PikachuVUNIONTopLeft) { player.discard.moveCardTo(card, slots[0]); } });
          player.assembledVUNIONs.push(this.name);
          slots[0].pokemonPlayedTurn = state.turn;
        }
      } else {
        throw new GameError(GameMessage.CANNOT_USE_POWER);
      }
    }

    return state;
  }
}
