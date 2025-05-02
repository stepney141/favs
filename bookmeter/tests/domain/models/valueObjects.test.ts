import { describe, it, expect } from "vitest";

import {
  success,
  failure,
  isSuccess,
  isFailure,
  unwrap,
  toEither,
  fromEither,
  left,
  right,
  isLeft,
  isRight
} from "../../../domain/models/valueObjects";

describe("Result型", () => {
  describe("success/failure関数", () => {
    it("successは成功の結果を生成する", () => {
      const result = success("test");
      expect(result.type).toBe("success");
      expect(result.value).toBe("test");
    });

    it("failureは失敗の結果を生成する", () => {
      const error = new Error("test error");
      const result = failure(error);
      expect(result.type).toBe("failure");
      expect(result.error).toBe(error);
    });
  });

  describe("isSuccess/isFailure関数", () => {
    it("isSuccessは成功の結果に対してtrueを返す", () => {
      const result = success("test");
      expect(isSuccess(result)).toBe(true);
      expect(isFailure(result)).toBe(false);
    });

    it("isFailureは失敗の結果に対してtrueを返す", () => {
      const result = failure(new Error("test error"));
      expect(isSuccess(result)).toBe(false);
      expect(isFailure(result)).toBe(true);
    });
  });

  describe("unwrap関数", () => {
    it("成功の結果からは値を取り出す", () => {
      const result = success("test");
      expect(unwrap(result)).toBe("test");
    });

    it("失敗の結果からは例外を投げる", () => {
      const error = new Error("test error");
      const result = failure(error);
      expect(() => unwrap(result)).toThrow(error);
    });

    it("失敗の結果のエラーがErrorオブジェクトでなければ、Errorでラップする", () => {
      const result = failure("string error");
      expect(() => unwrap(result)).toThrow("string error");
    });
  });

  describe("Either/Result変換", () => {
    it("toEitherは成功のResultをRightに変換する", () => {
      const result = success("test");
      const either = toEither(result);
      expect(isRight(either)).toBe(true);
      if (isRight(either)) {
        expect(either.right).toBe("test");
      }
    });

    it("toEitherは失敗のResultをLeftに変換する", () => {
      const error = new Error("test error");
      const result = failure(error);
      const either = toEither(result);
      expect(isLeft(either)).toBe(true);
      if (isLeft(either)) {
        expect(either.left).toBe(error);
      }
    });

    it("fromEitherはRightを成功のResultに変換する", () => {
      const either = right("test");
      const result = fromEither(either);
      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.value).toBe("test");
      }
    });

    it("fromEitherはLeftを失敗のResultに変換する", () => {
      const error = new Error("test error");
      const either = left(error);
      const result = fromEither(either);
      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error).toBe(error);
      }
    });
  });
});
