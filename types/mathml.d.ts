import "react";

/**
 * React's current DOM typings do not expose MathML intrinsic elements even
 * though modern browsers render them natively. Keep the augmentation narrow to
 * the presentation tags used by RIEVA's equation cards.
 */
declare module "react" {
  namespace JSX {
    interface MathMLAttributes extends HTMLAttributes<MathMLElement> {
      accent?: boolean | "true" | "false";
      display?: "block" | "inline";
      mathvariant?: string;
    }

    interface IntrinsicElements {
      math: MathMLAttributes;
      mfrac: MathMLAttributes;
      mi: MathMLAttributes;
      mn: MathMLAttributes;
      mo: MathMLAttributes;
      mover: MathMLAttributes;
      mrow: MathMLAttributes;
      msqrt: MathMLAttributes;
      msub: MathMLAttributes;
      msubsup: MathMLAttributes;
      msup: MathMLAttributes;
    }
  }
}

